'use client'

import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Plus, AlertTriangle, Check, Loader2, RefreshCw, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface Block {
  id: number;
  data: string;
  hash: string;
  previousHash: string;
  nonce: number;
  timestamp: number;
  difficulty: number;
}

type BlockchainState = {
  blocks: Block[];
  isMining: boolean;
  difficulty: number;
  pendingTransactions: string[];
};

type BlockchainAction =
  | { type: 'ADD_BLOCK'; block: Block }
  | { type: 'SET_MINING'; isMining: boolean }
  | { type: 'SET_DIFFICULTY'; difficulty: number }
  | { type: 'TAMPER_BLOCK'; id: number; newData: string }
  | { type: 'REVALIDATE_CHAIN' }
  | { type: 'ADD_PENDING_TRANSACTION'; transaction: string }
  | { type: 'CLEAR_PENDING_TRANSACTIONS' };

const initialState: BlockchainState = {
  blocks: [],
  isMining: false,
  difficulty: 2,
  pendingTransactions: [],
};

function blockchainReducer(state: BlockchainState, action: BlockchainAction): BlockchainState {
  switch (action.type) {
    case 'ADD_BLOCK':
      return { ...state, blocks: [...state.blocks, action.block] };
    case 'SET_MINING':
      return { ...state, isMining: action.isMining };
    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.difficulty };
    case 'TAMPER_BLOCK':
      return {
        ...state,
        blocks: state.blocks.map(block =>
          block.id === action.id ? { ...block, data: action.newData, hash: 'INVALID' } : block
        ),
      };
    case 'REVALIDATE_CHAIN':
      return {
        ...state,
        blocks: state.blocks.map((block, index) => {
          if (index === 0) return block;
          const previousBlock = state.blocks[index - 1];
          const hash = calculateHash(block.id, block.data, previousBlock.hash, block.nonce, block.timestamp);
          return { ...block, hash, previousHash: previousBlock.hash };
        }),
      };
    case 'ADD_PENDING_TRANSACTION':
      return { ...state, pendingTransactions: [...state.pendingTransactions, action.transaction] };
    case 'CLEAR_PENDING_TRANSACTIONS':
      return { ...state, pendingTransactions: [] };
    default:
      return state;
  }
}

function calculateHash(id: number, data: string, previousHash: string, nonce: number, timestamp: number): string {
  const input = `${id}${data}${previousHash}${nonce}${timestamp}`;
  return Array.from(input).reduce((hash, char) => {
    const chr = char.charCodeAt(0);
    hash = ((hash << 5) - hash) + chr;
    return hash & hash;
  }, 0).toString(16).padStart(8, '0');
}

const mineBlockWorker = `
  self.onmessage = function(e) {
    const { id, data, previousHash, difficulty, timestamp } = e.data;
    let nonce = 0;
    let hash = '';
    const target = '0'.repeat(difficulty);

    while (!hash.startsWith(target)) {
      nonce++;
      hash = calculateHash(id, data, previousHash, nonce, timestamp);
      if (nonce % 100000 === 0) {
        self.postMessage({ type: 'progress', nonce });
      }
    }

    self.postMessage({ type: 'result', nonce, hash });
  };

  function calculateHash(id, data, previousHash, nonce, timestamp) {
    const input = \`\${id}\${data}\${previousHash}\${nonce}\${timestamp}\`;
    return Array.from(input).reduce((hash, char) => {
      const chr = char.charCodeAt(0);
      hash = ((hash << 5) - hash) + chr;
      return hash & hash;
    }, 0).toString(16).padStart(8, '0');
  }
`;

export default function EnhancedBlockchainSimulator() {
  const [state, dispatch] = useReducer(blockchainReducer, initialState);
  const [newBlockData, setNewBlockData] = useState('');
  const [miningProgress, setMiningProgress] = useState(0);
  const [expandedBlocks, setExpandedBlocks] = useState<number[]>([]);

  useEffect(() => {
    addBlock('Genesis Block');
  }, []);

  const addBlock = useCallback(async (data: string) => {
    dispatch({ type: 'SET_MINING', isMining: true });
    const id = state.blocks.length;
    const timestamp = Date.now();
    const previousHash = state.blocks.length > 0 ? state.blocks[state.blocks.length - 1].hash : '0000';

    const workerBlob = new Blob([mineBlockWorker], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        setMiningProgress(e.data.nonce);
      } else if (e.data.type === 'result') {
        const { nonce, hash } = e.data;
        const newBlock: Block = { id, data, hash, previousHash, nonce, timestamp, difficulty: state.difficulty };
        dispatch({ type: 'ADD_BLOCK', block: newBlock });
        dispatch({ type: 'SET_MINING', isMining: false });
        dispatch({ type: 'CLEAR_PENDING_TRANSACTIONS' });
        setNewBlockData('');
        setMiningProgress(0);
        toast.success('Block mined and added to the chain!');
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      }
    };

    worker.postMessage({ id, data, previousHash, difficulty: state.difficulty, timestamp });
  }, [state.blocks, state.difficulty]);

  const validateChain = useCallback(() => {
    for (let i = 1; i < state.blocks.length; i++) {
      const currentBlock = state.blocks[i];
      const previousBlock = state.blocks[i - 1];
      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
      if (calculateHash(currentBlock.id, currentBlock.data, currentBlock.previousHash, currentBlock.nonce, currentBlock.timestamp) !== currentBlock.hash) {
        return false;
      }
    }
    return true;
  }, [state.blocks]);

  const tamperWithBlock = useCallback((id: number, newData: string) => {
    dispatch({ type: 'TAMPER_BLOCK', id, newData });
    toast.error('Block has been tampered with! Chain needs revalidation.');
  }, []);

  const revalidateChain = useCallback(() => {
    dispatch({ type: 'REVALIDATE_CHAIN' });
    toast.info('Chain has been revalidated.');
  }, []);

  const addPendingTransaction = useCallback((transaction: string) => {
    dispatch({ type: 'ADD_PENDING_TRANSACTION', transaction });
    toast.info('Transaction added to pending list.');
  }, []);

  const toggleBlockExpansion = (id: number) => {
    setExpandedBlocks(prev => 
      prev.includes(id) ? prev.filter(blockId => blockId !== id) : [...prev, id]
    );
  };

  return (
    <div className="p-4 max-w-4xl mx-auto bg-white min-h-screen text-black">
      <h1 className="text-4xl font-bold mb-8 text-center">
        Blockchain Simulator
      </h1>
      <div className="mb-8 space-y-4 bg-gray-100 p-6 rounded-lg shadow-md">
        <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2">
          <Input
            type="text"
            value={newBlockData}
            onChange={(e) => setNewBlockData(e.target.value)}
            placeholder="Enter block data"
            className="flex-grow bg-white text-black border-gray-300"
            disabled={state.isMining}
          />
          <Button 
            onClick={() => addBlock(newBlockData)} 
            disabled={!newBlockData || state.isMining}
            className="w-full md:w-auto bg-black text-white hover:bg-gray-800"
          >
            {state.isMining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {state.isMining ? 'Mining...' : 'Mine Block'}
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <span>Difficulty:</span>
          <Slider
            value={[state.difficulty]}
            onValueChange={(value) => dispatch({ type: 'SET_DIFFICULTY', difficulty: value[0] })}
            max={5}
            step={1}
            className="w-[200px]"
            disabled={state.isMining}
          />
          <span>{state.difficulty}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Higher difficulty requires more computational work to mine a block</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {state.isMining && (
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-black h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${(miningProgress / 1000000) * 100}%` }}
            ></div>
          </div>
        )}
      </div>
      <div className="mb-8 flex flex-wrap justify-center gap-4">
        <Button 
          onClick={() => toast.info(validateChain() ? 'Blockchain is valid!' : 'Blockchain is invalid!')} 
          variant="outline"
          className="bg-white text-black border-black hover:bg-gray-100"
        >
          Validate Chain
        </Button>
        <Button 
          onClick={revalidateChain} 
          variant="outline"
          className="bg-white text-black border-black hover:bg-gray-100"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Revalidate Chain
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-white text-black border-black hover:bg-gray-100">
              What is Blockchain?
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white text-black">
            <DialogHeader>
              <DialogTitle>Understanding Blockchain</DialogTitle>
              <DialogDescription>
                A blockchain is a distributed, decentralized, and typically public digital ledger consisting of records called blocks. Each block contains a cryptographic hash of the previous block, a timestamp, and transaction data, making it resistant to modification of its data.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Pending Transactions</h2>
        <div className="flex flex-col space-y-2">
          <Input
            type="text"
            placeholder="Enter transaction data"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                addPendingTransaction((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
            className="bg-white text-black border-gray-300"
          />
          {state.pendingTransactions.map((transaction, index) => (
            <div key={index} className="bg-gray-100 p-2 rounded">
              {transaction}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <AnimatePresence>
          {state.blocks.map((block, index) => (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className={`${validateChain() ? 'border-green-500' : 'border-red-500'} bg-white shadow-sm`}>
                <CardHeader className="cursor-pointer" onClick={() => toggleBlockExpansion(block.id)}>
                  <CardTitle className="flex justify-between items-center text-black">
                    <span>Block {block.id}</span>
                    {validateChain() ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    )}
                    {expandedBlocks.includes(block.id) ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </CardTitle>
                </CardHeader>
                {expandedBlocks.includes(block.id) && (
                  <CardContent className="text-gray-700">
                    <p><strong>Data:</strong> {block.data}</p>
                    <p><strong>Hash:</strong> {block.hash}</p>
                    <p><strong>Previous Hash:</strong> {block.previousHash}</p>
                    <p><strong>Nonce:</strong> {block.nonce}</p>
                    <p><strong>Timestamp:</strong> {new Date(block.timestamp).toLocaleString()}</p>
                    <p><strong>Difficulty:</strong> {block.difficulty}</p>
                    {index > 0 && (
                      <Button 
                        onClick={() => tamperWithBlock(block.id, block.data + ' (tampered)')}
                        variant="destructive"
                        size="sm"
                        className="mt-2 bg-red-600 hover:bg-red-700 text-white"
                        disabled={state.isMining}
                      >
                        Tamper with Block
                      </Button>
                    )}
                  </CardContent>
                )}
              </Card>
              {index < state.blocks.length - 1 && (
                <div className="h-4 w-0.5 bg-black mx-auto my-1" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <ToastContainer 
        position="bottom-right" 
        theme="light"
        toastClassName="bg-white text-black"
      />
    </div>
  );
}