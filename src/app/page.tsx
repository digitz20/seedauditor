
// @ts-nocheck
'use client';

import type { ProcessedWalletInfo, AddressBalanceResult } from './actions';
import { generateAndCheckSeedPhrases, type GenerateAndCheckSeedPhrasesOutput, type GenerateAndCheckSeedPhrasesInput, type FlowBalanceResult } from '@/ai/flows/random-seed-phrase';
import type { SingleSeedPhraseResult as FlowSingleSeedPhraseResult } from '@/ai/flows/random-seed-phrase';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, Terminal, Loader2, Wallet, Network, Coins, Copy, Eraser, Trash2, KeyRound, Info, ExternalLink, SearchCheck, ShieldAlert, DatabaseZap, Pause, Play, Square, Settings2, ListChecks, ScrollText, PlusCircle, Bitcoin, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { processSeedPhrasesAndFetchBalances } from './actions';


interface ResultRow extends Omit<ProcessedWalletInfo, 'balanceData' | 'cryptoName'> {
  isLoading: boolean;
  wordCount?: number;
  balanceData: AddressBalanceResult[] | FlowBalanceResult[] | null;
  displayCryptoName?: string | null;
  displayBalance?: number | null;
  displayDataSource?: AddressBalanceResult['dataSource'] | FlowBalanceResult['dataSource'] | null;
  numOtherBalances?: number;
}


const MAX_DISPLAYED_RESULTS = 500;
const MAX_LOGS = 100;
type GenerationStatus = 'Stopped' | 'Running' | 'Paused';

// localStorage keys
const LOCAL_STORAGE_CHECKED_COUNT_KEY = 'autoGenCheckedCount';
const LOCAL_STORAGE_GENERATION_STATUS_KEY = 'autoGenStatus';
const LOCAL_STORAGE_GENERATION_PAUSED_KEY = 'autoGenPaused';
const LOCAL_STORAGE_AUTO_GEN_BATCH_SIZE_KEY = 'autoGenBatchSize';
const LOCAL_STORAGE_USER_STOPPED_KEY = 'autoGenUserStopped';


export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>('');
  const [etherscanApiKeyInput, setEtherscanApiKeyInput] = useState<string>(process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || 'ZKPID4755Q9BJZVXXZ96M3N6RSXYE7NTRV');
  const [blockcypherApiKeyInput, setBlockcypherApiKeyInput] = useState<string>(process.env.NEXT_PUBLIC_BLOCKCYPHER_API_KEY || '41ccb7c601ef4bad99b3698cfcea9a8c');
  const [alchemyApiKeyInput, setAlchemyApiKeyInput] = useState<string>(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || 'p4UZuRIRutN5yn06iKDjOcAX2nB75ZRp');
  const [blockstreamClientIdInput, setBlockstreamClientIdInput] = useState<string>(process.env.NEXT_PUBLIC_BLOCKSTREAM_CLIENT_ID || '6b33450a-92f8-40a9-81a8-6e77acd2dfc9');
  const [blockstreamClientSecretInput, setBlockstreamClientSecretInput] = useState<string>(process.env.NEXT_PUBLIC_BLOCKSTREAM_CLIENT_SECRET || 'Czvm15Usa29MlYcnJRPK7ZeLNUm1x7kP');
  const [cryptoApisApiKeyInput, setCryptoApisApiKeyInput] = useState<string>('1e50a99cde21ebd081ebcc046da521524a5e4e8e');
  const [mobulaApiKeyInput, setMobulaApiKeyInput] = useState<string>('93a9e533-c035-45ff-9802-516568e2f16a');
  const [moralisApiKeyInput, setMoralisApiKeyInput] = useState<string>('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjY3MzE0ZmM0LTQzYWItNDI4MC04YTNmLWFhMzc3NTE5MmVjZiIsIm9yZ0lkIjoiNDUyMzQ2IiwidXNlcklkIjoiNDY1NDIzIiwidHlwZUlkIjoiZGJmYjk1ZjAtOGY2Ni00YmYyLTgwYjYtNTQxNGI4OTU1ZThjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NDk1MTA3NDIsImV4cCI6NDkwNTI3MDc0Mn0.-ueWDNCeaUKIOMihmnrn2WB-u5T1fPxLhw5jVyqSC74');
  const [bitqueryApiKeyInput, setBitqueryApiKeyInput] = useState<string>('ory_at_vuqYIfb98SRRm0Knjd4N6AB7Wo3uSXwRQrUgOt_DjQo.MvjKfO0tR9rGOD_w4SyGEk15U0PTQ2vK6j-Td2qI2qs');


  const [showEtherscanKey, setShowEtherscanKey] = useState(false);
  const [showBlockcypherKey, setShowBlockcypherKey] = useState(false);
  const [showAlchemyKey, setShowAlchemyKey] = useState(false);
  const [showBlockstreamClientId, setShowBlockstreamClientId] = useState(false);
  const [showBlockstreamClientSecret, setShowBlockstreamClientSecret] = useState(false);
  const [showCryptoApisApiKey, setShowCryptoApisApiKey] = useState(false);
  const [showMobulaApiKey, setShowMobulaApiKey] = useState(false);
  const [showMoralisApiKey, setShowMoralisApiKey] = useState(false);
  const [showBitqueryApiKey, setShowBitqueryApiKey] = useState(false);


  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessingManual, setIsProcessingManual] = useState<boolean>(false);
  const [numSeedPhrasesToGenerate, setNumSeedPhrasesToGenerate] = useState<number>(100);

  const { toast } = useToast();

  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isAutoGenerationPaused, setIsAutoGenerationPaused] = useState(false);
  const [checkedPhrasesCount, setCheckedPhrasesCount] = useState<number>(0);
  const [phrasesInBatchDisplay, setPhrasesInBatchDisplay] = useState<number>(0);

  const [currentGenerationStatus, setCurrentGenerationStatus] = useState<GenerationStatus>('Stopped');
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isAutoGeneratingRef = useRef(isAutoGenerating);
  const isAutoGenerationPausedRef = useRef(isAutoGenerationPaused);
  const numSeedPhrasesToGenerateRef = useRef(numSeedPhrasesToGenerate);
  const etherscanApiKeyInputRef = useRef(etherscanApiKeyInput);
  const blockcypherApiKeyInputRef = useRef(blockcypherApiKeyInput);
  const alchemyApiKeyInputRef = useRef(alchemyApiKeyInput);
  const blockstreamClientIdInputRef = useRef(blockstreamClientIdInput);
  const blockstreamClientSecretInputRef = useRef(blockstreamClientSecretInput);
  const cryptoApisApiKeyInputRef = useRef(cryptoApisApiKeyInput);
  const mobulaApiKeyInputRef = useRef(mobulaApiKeyInput);
  const moralisApiKeyInputRef = useRef(moralisApiKeyInput);
  const bitqueryApiKeyInputRef = useRef(bitqueryApiKeyInput);
  const checkedPhrasesCountRef = useRef(checkedPhrasesCount);


  useEffect(() => { isAutoGeneratingRef.current = isAutoGenerating; }, [isAutoGenerating]);
  useEffect(() => {
    isAutoGenerationPausedRef.current = isAutoGenerationPaused;
    if (isAutoGeneratingRef.current) {
        localStorage.setItem(LOCAL_STORAGE_GENERATION_PAUSED_KEY, isAutoGenerationPaused.toString());
    }
  }, [isAutoGenerationPaused]);

  useEffect(() => { numSeedPhrasesToGenerateRef.current = numSeedPhrasesToGenerate; }, [numSeedPhrasesToGenerate]);
  useEffect(() => { etherscanApiKeyInputRef.current = etherscanApiKeyInput; }, [etherscanApiKeyInput]);
  useEffect(() => { blockcypherApiKeyInputRef.current = blockcypherApiKeyInput; }, [blockcypherApiKeyInput]);
  useEffect(() => { alchemyApiKeyInputRef.current = alchemyApiKeyInput; }, [alchemyApiKeyInput]);
  useEffect(() => { blockstreamClientIdInputRef.current = blockstreamClientIdInput; }, [blockstreamClientIdInput]);
  useEffect(() => { blockstreamClientSecretInputRef.current = blockstreamClientSecretInput; }, [blockstreamClientSecretInput]);
  useEffect(() => { cryptoApisApiKeyInputRef.current = cryptoApisApiKeyInput; }, [cryptoApisApiKeyInput]);
  useEffect(() => { mobulaApiKeyInputRef.current = mobulaApiKeyInput; }, [mobulaApiKeyInput]);
  useEffect(() => { moralisApiKeyInputRef.current = moralisApiKeyInput; }, [moralisApiKeyInput]);
  useEffect(() => { bitqueryApiKeyInputRef.current = bitqueryApiKeyInput; }, [bitqueryApiKeyInput]);


  useEffect(() => {
    checkedPhrasesCountRef.current = checkedPhrasesCount;
    if (currentGenerationStatus === 'Running' || currentGenerationStatus === 'Paused') {
        localStorage.setItem(LOCAL_STORAGE_CHECKED_COUNT_KEY, checkedPhrasesCount.toString());
    }
  }, [checkedPhrasesCount, currentGenerationStatus]);


  useEffect(() => {
    if (isAutoGeneratingRef.current) {
        localStorage.setItem(LOCAL_STORAGE_GENERATION_STATUS_KEY, currentGenerationStatus);
    }
  }, [currentGenerationStatus]);

  // Persist numSeedPhrasesToGenerate to localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_AUTO_GEN_BATCH_SIZE_KEY, numSeedPhrasesToGenerate.toString());
  }, [numSeedPhrasesToGenerate]);


  const addLogMessage = useCallback((message: string) => {
    setGenerationLogs(prevLogs => {
      const newLogs = [`[${new Date().toLocaleTimeString()}] ${message}`, ...prevLogs];
      return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
    });
  }, []);

  const processAndSetDisplayBalances = useCallback((data: ProcessedWalletInfo[] | GenerateAndCheckSeedPhrasesOutput, isFromFlow: boolean = false): ResultRow[] => {
    if (!data) {
        addLogMessage(`Flow Execution Error: Received null data from flow.`);
        return [];
    }

    return data.map(item => {
      let allPositiveBalances: (AddressBalanceResult | FlowBalanceResult)[] = [];
      let wordCountVal: number;
      let itemBalances: any[] = [];
      let itemError = item.error || null;
      let itemDerivationError = item.derivationError || null;

      if (isFromFlow) {
        const flowItem = item as FlowSingleSeedPhraseResult;
        itemBalances = flowItem.balances || [];
        allPositiveBalances = itemBalances;
        wordCountVal = flowItem.wordCount;
      } else {
        const actionItem = item as ProcessedWalletInfo;
        itemBalances = actionItem.balanceData || [];
        allPositiveBalances = itemBalances;
        wordCountVal = actionItem.seedPhrase.split(' ').length;
      }

      if (itemDerivationError) {
        return null;
      }
      if (itemError && allPositiveBalances.length === 0) {
          return null;
      }
      if(allPositiveBalances.length === 0) {
        return null;
      }

      let primaryBalance: AddressBalanceResult | FlowBalanceResult | undefined;
      const btcBalance = allPositiveBalances.find(b => b.currency?.toUpperCase() === 'BTC' && b.balance > 0);

      if (btcBalance) {
        primaryBalance = btcBalance;
      } else if (allPositiveBalances.length > 0) {
        const ethBalance = allPositiveBalances.find(b => b.currency?.toUpperCase() === 'ETH' && b.balance > 0);
        if (ethBalance) {
            primaryBalance = ethBalance;
        } else {
            primaryBalance = allPositiveBalances[0];
        }
      }


      return {
        seedPhrase: item.seedPhrase,
        derivedAddress: item.derivedAddress,
        walletType: item.walletType,
        balanceData: itemBalances,
        error: itemError,
        derivationError: itemDerivationError,
        isLoading: false,
        wordCount: wordCountVal,
        displayCryptoName: primaryBalance?.currency,
        displayBalance: primaryBalance?.balance,
        displayDataSource: primaryBalance?.dataSource as AddressBalanceResult['dataSource'] | FlowBalanceResult['dataSource'],
        numOtherBalances: primaryBalance && allPositiveBalances.length > 1 ? allPositiveBalances.length - 1 : 0,
      };
    }).filter(Boolean) as ResultRow[];
  }, [addLogMessage]);


  const handleFetchBalances = async () => {
    const phrases = seedPhrasesInput
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (phrases.length === 0) {
      toast({
        title: 'No Seed Phrases Entered',
        description: 'Please enter at least one seed phrase.',
        variant: 'destructive',
      });
      return;
    }

    const hasEtherscanKey = etherscanApiKeyInputRef.current.trim();
    const hasBlockcypherKey = blockcypherApiKeyInputRef.current.trim();
    const hasAlchemyKey = alchemyApiKeyInputRef.current.trim();
    const hasBlockstreamCreds = blockstreamClientIdInputRef.current.trim() && blockstreamClientSecretInputRef.current.trim();
    const hasCryptoApis = cryptoApisApiKeyInputRef.current.trim();
    const hasMobula = mobulaApiKeyInputRef.current.trim();
    const hasMoralis = moralisApiKeyInputRef.current.trim();
    const hasBitquery = bitqueryApiKeyInputRef.current.trim();


    if (!hasEtherscanKey && !hasBlockcypherKey && !hasAlchemyKey && !hasBlockstreamCreds && !hasCryptoApis && !hasMobula && !hasMoralis && !hasBitquery) {
      toast({
        title: 'API Key/Credentials Recommended for Real Balances',
        description: 'Provide at least one set of API credentials. Manual checks without them will not find any real balances.',
        variant: 'default',
      });
    }


    if (phrases.length > 1000) {
      toast({
        title: 'Too Many Seed Phrases',
        description: 'Please enter no more than 1000 seed phrases at a time for optimal performance.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessingManual(true);
    addLogMessage(`Manual check: Processing ${phrases.length} seed phrases...`);
    const validPhrases = phrases.filter(phrase => {
        const wordCount = phrase.split(' ').length;
        const isValid = [12, 15, 18, 21, 24].includes(wordCount);
        if (!isValid) {
            addLogMessage(`Manual check: Invalid seed phrase (word count) skipped: ${maskValue(phrase,4,4)}`);
        }
        return isValid;
    });

    if (validPhrases.length === 0 && phrases.length > 0) {
        addLogMessage(`Manual check: All ${phrases.length} provided phrases were invalid.`);
        toast({ title: 'Invalid Seed Phrases', description: 'None of the provided seed phrases had a valid word count (12, 15, 18, 21, or 24).', variant: 'destructive' });
        setIsProcessingManual(false);
        return;
    }

    try {
      const processedDataFromAction = await processSeedPhrasesAndFetchBalances(
        validPhrases,
        etherscanApiKeyInputRef.current || undefined,
        blockcypherApiKeyInputRef.current || undefined,
        alchemyApiKeyInputRef.current || undefined,
        blockstreamClientIdInputRef.current || undefined,
        blockstreamClientSecretInputRef.current || undefined,
        cryptoApisApiKeyInputRef.current || undefined,
        mobulaApiKeyInputRef.current || undefined,
        moralisApiKeyInputRef.current || undefined,
        bitqueryApiKeyInputRef.current || undefined
      );

      const finalResults = processAndSetDisplayBalances(processedDataFromAction, false);
      const displayableResults = finalResults;

      addLogMessage(`Manual check: Finished. Found ${displayableResults.length} wallet(s) with balance from ${validPhrases.length} valid phrases.`);
      setResults(prevResults => [...displayableResults, ...prevResults].slice(0,MAX_DISPLAYED_RESULTS));


      let toastMessage = `Finished processing ${validPhrases.length} valid seed phrase(s). `;
      toastMessage += `Found ${displayableResults.length} wallet(s) with at least one non-zero balance.`;

      if (!hasEtherscanKey && !hasBlockcypherKey && !hasAlchemyKey && !hasBlockstreamCreds && !hasCryptoApis && !hasMobula && !hasMoralis && !hasBitquery && validPhrases.length > 0) {
        toastMessage += ' No API keys/credentials were provided, so no real balances could be fetched.';
      }

      toast({
        title: 'Balance Check Complete',
        description: toastMessage,
      });

    } catch (error: any) {
      console.error("General error during balance fetching process:", error);
      addLogMessage(`Manual check error: ${error.message}`);
      toast({
        title: 'Processing Error',
        description: `An unexpected error occurred: ${error.message}. Some results might be incomplete.`,
        variant: 'destructive',
      });
    }

    setIsProcessingManual(false);
  };

  const handleManualGenerateAndCheck = async () => {
    if (!etherscanApiKeyInputRef.current && !blockcypherApiKeyInputRef.current && !alchemyApiKeyInputRef.current && (!blockstreamClientIdInputRef.current || !blockstreamClientSecretInputRef.current) && !cryptoApisApiKeyInputRef.current && !mobulaApiKeyInputRef.current && !moralisApiKeyInputRef.current && !bitqueryApiKeyInputRef.current) {
      toast({
        title: 'API Key(s)/Credentials Required',
        description: 'Please provide at least one set of API credentials for the generator to fetch real balances.',
        variant: 'destructive',
      });
      return;
    }
    setIsProcessingManual(true);
    addLogMessage(`Manual generation: Requesting ${numSeedPhrasesToGenerateRef.current} phrases...`);
    try {
      const input: GenerateAndCheckSeedPhrasesInput = {
        numSeedPhrases: numSeedPhrasesToGenerateRef.current,
        etherscanApiKey: etherscanApiKeyInputRef.current || undefined,
        blockcypherApiKey: blockcypherApiKeyInputRef.current || undefined,
        alchemyApiKey: alchemyApiKeyInputRef.current || undefined,
        blockstreamClientId: blockstreamClientIdInputRef.current || undefined,
        blockstreamClientSecret: blockstreamClientSecretInputRef.current || undefined,
        cryptoApisApiKey: cryptoApisApiKeyInputRef.current || undefined,
        mobulaApiKey: mobulaApiKeyInputRef.current || undefined,
        moralisApiKey: moralisApiKeyInputRef.current || undefined,
        bitqueryApiKey: bitqueryApiKeyInputRef.current || undefined,
      };

      const generatedDataFromFlow: GenerateAndCheckSeedPhrasesOutput = await generateAndCheckSeedPhrases(input);

      if (!generatedDataFromFlow) {
          console.error("Genkit Flow Execution Error: Returned null");
          addLogMessage(`Manual generation error: Genkit flow failed and returned null.`);
          toast({
            title: 'Genkit Flow Execution Error',
            description: `The seed phrase generation process failed. Please check console for details.`,
            variant: 'destructive',
          });
          setIsProcessingManual(false);
          return;
      }

      const processedResults = processAndSetDisplayBalances(generatedDataFromFlow, true);
      const actualFoundResults = processedResults;

      addLogMessage(`Manual generation: Received ${actualFoundResults.length} phrases with balance from ${numSeedPhrasesToGenerateRef.current} generated.`);
      setResults(prevResults => [...actualFoundResults, ...prevResults].slice(0, MAX_DISPLAYED_RESULTS));

      toast({
        title: 'Seed Phrases Generated and Checked',
        description: `Generated and checked ${numSeedPhrasesToGenerateRef.current} seed phrases. Found ${actualFoundResults.length} with balance.`,
      });
    } catch (error: any) {
      console.error("Error generating and checking seed phrases (client-side catch):", error);
      addLogMessage(`Manual generation error: ${error.message}`);
      toast({
        title: 'Generation and Check Error',
        description: `An unexpected error occurred: ${error.message}. Check console for details.`,
        variant: 'destructive',
      });
    } finally {
      setIsProcessingManual(false);
    }
  };

  const handleClearInput = () => {
    setSeedPhrasesInput('');
    toast({
      title: 'Seed Phrase Input Cleared',
      description: 'The seed phrase input area has been cleared.',
    });
  };

  const handleClearResults = () => {
    setResults([]);
    toast({
      title: 'Results Cleared',
      description: 'All fetched balance results have been cleared.',
    });
  };

  const stopAutoGenerating = useCallback((clearPersistence = true) => {
    addLogMessage('Stopped automatic seed phrase generation.');
    setIsAutoGenerating(false);
    setIsAutoGenerationPaused(false);
    setCurrentGenerationStatus('Stopped');
    setPhrasesInBatchDisplay(0);

    isAutoGeneratingRef.current = false;
    isAutoGenerationPausedRef.current = false;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (clearPersistence) {
      localStorage.setItem(LOCAL_STORAGE_USER_STOPPED_KEY, 'true');
      addLogMessage('Clearing persisted generation state (count, status, paused). Batch size setting remains.');
      localStorage.removeItem(LOCAL_STORAGE_CHECKED_COUNT_KEY);
      localStorage.removeItem(LOCAL_STORAGE_GENERATION_STATUS_KEY);
      localStorage.removeItem(LOCAL_STORAGE_GENERATION_PAUSED_KEY);
      setCheckedPhrasesCount(0);
      checkedPhrasesCountRef.current = 0;
    }
  }, [addLogMessage]);

  const pauseAutoGenerating = useCallback(() => {
    if (!isAutoGeneratingRef.current || isAutoGenerationPausedRef.current) return;
    addLogMessage('Pausing automatic seed phrase generation.');
    setIsAutoGenerationPaused(true);
    setCurrentGenerationStatus('Paused');

    isAutoGenerationPausedRef.current = true;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [addLogMessage]);


  const runAutoGenerationStep = useCallback(async () => {
    if (!isAutoGeneratingRef.current || isAutoGenerationPausedRef.current) {
      setCurrentGenerationStatus(isAutoGenerationPausedRef.current ? 'Paused' : 'Stopped');
      if (!isAutoGenerationPausedRef.current) {
          setPhrasesInBatchDisplay(0);
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return;
    }

    setCurrentGenerationStatus('Running');
    const metaBatchSize = numSeedPhrasesToGenerateRef.current > 0 ? numSeedPhrasesToGenerateRef.current : 1;
    setPhrasesInBatchDisplay(metaBatchSize);

    const apiKeysDirectlyAvailableForStep =
        etherscanApiKeyInputRef.current?.trim() ||
        blockcypherApiKeyInputRef.current?.trim() ||
        alchemyApiKeyInputRef.current?.trim() ||
        (blockstreamClientIdInputRef.current?.trim() && blockstreamClientSecretInputRef.current?.trim()) ||
        cryptoApisApiKeyInputRef.current?.trim() ||
        mobulaApiKeyInputRef.current?.trim() ||
        moralisApiKeyInputRef.current?.trim() ||
        bitqueryApiKeyInputRef.current?.trim();


    if (!apiKeysDirectlyAvailableForStep) {
      addLogMessage('Auto-generation stopped: At least one set of API credentials is required.');
      stopAutoGenerating(true);
      toast({
        title: 'API Credentials Required',
        description: 'Auto-generation requires API credentials. Process stopped.',
        variant: 'destructive',
      });
      return;
    }

    addLogMessage(`Starting auto-generation batch of ${metaBatchSize} phrases. Session total (before this batch): ${checkedPhrasesCountRef.current}`);

    try {
      const input: GenerateAndCheckSeedPhrasesInput = {
        numSeedPhrases: metaBatchSize,
        etherscanApiKey: etherscanApiKeyInputRef.current || undefined,
        blockcypherApiKey: blockcypherApiKeyInputRef.current || undefined,
        alchemyApiKey: alchemyApiKeyInputRef.current || undefined,
        blockstreamClientId: blockstreamClientIdInputRef.current || undefined,
        blockstreamClientSecret: blockstreamClientSecretInputRef.current || undefined,
        cryptoApisApiKey: cryptoApisApiKeyInputRef.current || undefined,
        mobulaApiKey: mobulaApiKeyInputRef.current || undefined,
        moralisApiKey: moralisApiKeyInputRef.current || undefined,
        bitqueryApiKey: bitqueryApiKeyInputRef.current || undefined,
      };

      const generatedDataFromFlow: GenerateAndCheckSeedPhrasesOutput = await generateAndCheckSeedPhrases(input);

      setCheckedPhrasesCount(prevCount => prevCount + metaBatchSize);

      if (!generatedDataFromFlow) {
        console.error("Genkit Flow Error (Auto-Gen batch): Returned null");
        addLogMessage(`Auto-gen: Flow error for batch of ${metaBatchSize}.`);
      } else {
        const processedResultsForBatch = processAndSetDisplayBalances(generatedDataFromFlow, true);
        if (processedResultsForBatch.length > 0) {
          setResults(prevResults => [...processedResultsForBatch, ...prevResults].slice(0, MAX_DISPLAYED_RESULTS));
          addLogMessage(`Auto-gen: Found ${processedResultsForBatch.length} wallet(s) with balance in this batch.`);
        }
      }

      addLogMessage(`Completed auto-generation batch of ${metaBatchSize}. Total phrases attempted in session: ${checkedPhrasesCountRef.current}.`);

    } catch (error: any) {
      console.error("Error during automatic seed phrase generation batch:", error);
      addLogMessage(`Error in auto-gen batch: ${error.message}`);
      if (error.message?.includes("rate limit") || error.message?.includes("API key quota exceeded") || error.message?.includes("blocked") || error.status === 429) {
        addLogMessage("Rate limit or API issue likely. Pausing generation for 1 minute.");
        pauseAutoGenerating();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          if(isAutoGeneratingRef.current && isAutoGenerationPausedRef.current) {
             addLogMessage("Attempting to resume auto-generation after rate limit pause.");
             setIsAutoGenerationPaused(false);
             // Will be picked up by startAutoGenerating or manual resume
          }
        }, 60000);
        return;
      } else {
        addLogMessage(`Unexpected error in auto-generation: ${error.message}. Pausing.`);
        pauseAutoGenerating();
        toast({
          title: 'Auto-Generation Paused',
          description: `An unexpected error occurred: ${error.message}. Auto-generation has been paused.`,
          variant: 'destructive',
        });
        return;
      }
    }

    if (isAutoGeneratingRef.current && !isAutoGenerationPausedRef.current) {
      const delay = 1500;
      timeoutRef.current = setTimeout(runAutoGenerationStep, delay);
    } else {
       setCurrentGenerationStatus(isAutoGenerationPausedRef.current ? 'Paused' : 'Stopped');
       if (!isAutoGenerationPausedRef.current) {
            setPhrasesInBatchDisplay(0);
       }
       if (timeoutRef.current) clearTimeout(timeoutRef.current);
       timeoutRef.current = null;
    }
  }, [
    addLogMessage, toast, processAndSetDisplayBalances, stopAutoGenerating, pauseAutoGenerating,
  ]);


  const startAutoGenerating = useCallback((isResumingFromRefresh = false) => {
    localStorage.removeItem(LOCAL_STORAGE_USER_STOPPED_KEY);
    const wasPaused = isAutoGenerationPausedRef.current;
    const currentBatchSizeSetting = numSeedPhrasesToGenerateRef.current > 0 ? numSeedPhrasesToGenerateRef.current : 1;

    const apiKeysDirectlyAvailableForStart =
        etherscanApiKeyInputRef.current?.trim() ||
        blockcypherApiKeyInputRef.current?.trim() ||
        alchemyApiKeyInputRef.current?.trim() ||
        (blockstreamClientIdInputRef.current?.trim() && blockstreamClientSecretInputRef.current?.trim()) ||
        cryptoApisApiKeyInputRef.current?.trim() ||
        mobulaApiKeyInputRef.current?.trim() ||
        moralisApiKeyInputRef.current?.trim() ||
        bitqueryApiKeyInputRef.current?.trim();

    if (!apiKeysDirectlyAvailableForStart) {
      addLogMessage('Auto-generation cannot start/resume: API credentials required.');
      toast({
        title: 'API Credentials Required',
        description: 'Provide API credentials to start/resume auto-generation.',
        variant: 'destructive',
      });
      if (isResumingFromRefresh) {
          stopAutoGenerating(true);
      }
      return;
    }

    addLogMessage(isResumingFromRefresh ? 'Resuming auto-generation session...' : (wasPaused ? 'Resuming automatic generation...' : 'Starting automatic generation...'));

    setPhrasesInBatchDisplay(currentBatchSizeSetting);

    setIsAutoGenerating(true);
    isAutoGeneratingRef.current = true;
    setIsAutoGenerationPaused(false);
    isAutoGenerationPausedRef.current = false;
    setCurrentGenerationStatus('Running');

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    runAutoGenerationStep();
  }, [addLogMessage, runAutoGenerationStep, toast, stopAutoGenerating]);


  useEffect(() => {
    // Load batch size first, as it's independent
    const storedBatchSizeStr = localStorage.getItem(LOCAL_STORAGE_AUTO_GEN_BATCH_SIZE_KEY);
    if (storedBatchSizeStr) {
        const storedBatchSize = parseInt(storedBatchSizeStr, 10);
        if (!isNaN(storedBatchSize) && storedBatchSize >= 1 && storedBatchSize <= 100) {
            setNumSeedPhrasesToGenerate(storedBatchSize);
        } else {
            setNumSeedPhrasesToGenerate(100); // Default if stored is invalid
        }
    } else {
        setNumSeedPhrasesToGenerate(100); // Default if nothing in storage
    }

    // Load checked count, it's useful regardless of state
    const storedCheckedCountStr = localStorage.getItem(LOCAL_STORAGE_CHECKED_COUNT_KEY);
    if (storedCheckedCountStr) {
        const initialCheckedCount = parseInt(storedCheckedCountStr, 10);
        if (!isNaN(initialCheckedCount)) {
            setCheckedPhrasesCount(initialCheckedCount);
            checkedPhrasesCountRef.current = initialCheckedCount;
        }
    }

    // Check if user has explicitly stopped
    const userHasExplicitlyStopped = localStorage.getItem(LOCAL_STORAGE_USER_STOPPED_KEY) === 'true';
    if (userHasExplicitlyStopped) {
        addLogMessage('Auto-generation is stopped by user. Click Start/Resume to begin.');
        setCurrentGenerationStatus('Stopped');
        setIsAutoGenerating(false);
        setIsAutoGenerationPaused(false);
        setPhrasesInBatchDisplay(0);
        return; // Exit and do not start
    }

    // Check for API keys
    const apiKeysAvailableOnMount =
      etherscanApiKeyInputRef.current?.trim() ||
      blockcypherApiKeyInputRef.current?.trim() ||
      alchemyApiKeyInputRef.current?.trim() ||
      (blockstreamClientIdInputRef.current?.trim() && blockstreamClientSecretInputRef.current?.trim()) ||
      cryptoApisApiKeyInputRef.current?.trim() ||
      mobulaApiKeyInputRef.current?.trim() ||
      moralisApiKeyInputRef.current?.trim() ||
      bitqueryApiKeyInputRef.current?.trim();

    if (!apiKeysAvailableOnMount) {
        addLogMessage('Auto-generation cannot start automatically: API credentials required.');
        setCurrentGenerationStatus('Stopped');
        setIsAutoGenerating(false);
        setIsAutoGenerationPaused(false);
        setPhrasesInBatchDisplay(0);
        return; // Exit and do not start
    }

    // If not stopped by the user and API keys are present, start or resume the session.
    startAutoGenerating(true); // true = is resuming/refresh scenario

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);


  const getCurrencyIcon = (currencySymbol: string | null | undefined) => {
    if (!currencySymbol) return '?';
    const upperSymbol = currencySymbol.toUpperCase();
    if (upperSymbol.includes('ETH') || upperSymbol === 'ARBITRUM' || upperSymbol === 'OPTIMISM' || upperSymbol === 'BASE') return 'Ξ';
    if (upperSymbol.includes('BTC')) return <Bitcoin className="h-3 w-3" />;
    if (upperSymbol.includes('LTC')) return 'Ł';
    if (upperSymbol.includes('DOGE')) return 'Ð';
    if (upperSymbol.includes('DASH')) return 'D';
    if (upperSymbol.includes('MATIC')) return 'MATIC'.charAt(0);
    return currencySymbol.charAt(0).toUpperCase();
  };

  const maskValue = (value: string, start = 5, end = 5) => {
    if (!value || value.length < start + end + 3) return value;
    return `${value.substring(0, start)}...${value.substring(value.length - end)}`;
  };

  const handleCopyText = async (textToCopy: string | null, type: string) => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: `${type} Copied`,
        description: `The ${type.toLowerCase()} has been copied to your clipboard.`,
      });
    } catch (err) {
      console.error(`Failed to copy ${type.toLowerCase()}: `, err);
      toast({
        title: 'Copy Failed',
        description: `Could not copy ${type.toLowerCase()} to clipboard. Ensure you are on HTTPS or localhost.`,
        variant: 'destructive',
      });
    }
  };

  const getDataSourceTag = (dataSource: AddressBalanceResult['dataSource'] | FlowBalanceResult['dataSource'] | undefined | null) => {
    switch (dataSource) {
      case 'Etherscan API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300">Etherscan</span>;
      case 'BlockCypher API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-300">BlockCypher</span>;
      case 'Alchemy API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-800/30 dark:text-purple-300">Alchemy</span>;
      case 'Blockstream API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-800/30 dark:text-orange-300">Blockstream</span>;
      case 'CryptoAPIs.io API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 text-cyan-800 dark:bg-cyan-800/30 dark:text-cyan-300">CryptoAPIs</span>;
      case 'Mobula.io API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-pink-100 text-pink-800 dark:bg-pink-800/30 dark:text-pink-300">Mobula.io</span>;
      case 'Moralis API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-800/30 dark:text-indigo-300">Moralis</span>;
      case 'Bitquery API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-800 dark:bg-teal-800/30 dark:text-teal-300">Bitquery</span>;
      case 'Simulated Fallback':
         return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-800/30 dark:text-amber-300">Simulated</span>;
      case 'N/A':
      case 'Unknown':
      case 'Error':
      default:
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300">{dataSource || 'N/A'}</span>;
    }
  };

 const getFetchButtonTextSuffix = () => {
    const keys = [];
    if (etherscanApiKeyInputRef.current?.trim()) keys.push('Etherscan');
    if (blockcypherApiKeyInputRef.current?.trim()) keys.push('BlockCypher');
    if (alchemyApiKeyInputRef.current?.trim()) keys.push('Alchemy');
    if (blockstreamClientIdInputRef.current?.trim() && blockstreamClientSecretInputRef.current?.trim()) keys.push('Blockstream');
    if (cryptoApisApiKeyInputRef.current?.trim()) keys.push('CryptoAPIs');
    if (mobulaApiKeyInputRef.current?.trim()) keys.push('Mobula.io');
    if (moralisApiKeyInputRef.current?.trim()) keys.push('Moralis');
    if (bitqueryApiKeyInputRef.current?.trim()) keys.push('Bitquery');


    if (keys.length === 0) return ' (No API Credentials - Manual Check Ineffective)';
    if (keys.length === 1) return ` (Use ${keys[0]} API)`;
    if (keys.length === 2) return ` (Use ${keys.join(' & ')} APIs)`;
    if (keys.length > 2) return ` (Use ${keys.slice(0, -1).join(', ')} & ${keys.slice(-1)} APIs)`;
    return ' (Use All Configured APIs)';
  };


  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-2">
          <Wallet className="h-8 w-8" /> Balance Auditor
        </h1>
        <p className="text-muted-foreground">
          Enter seed phrases and API keys to derive EVM addresses and fetch real balances across multiple supported chains and cryptocurrencies. Or, use the automatic generator.
        </p>
      </header>

      <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/50 text-destructive dark:text-destructive [&>svg]:text-destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Critical Security Warning & Usage Notice</AlertTitle>
        <AlertDescription>
          <strong>NEVER enter REAL seed phrases from wallets with significant funds into ANY online tool you do not fully trust and haven&apos;t audited.</strong>
          This application is for demonstration and educational purposes.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>It uses <code>ethers.js</code> for LOCAL address derivation (primarily EVM-compatible). Your seed phrases are NOT sent to any server for derivation.</li>
            <li>It WILL attempt to use provided API keys/credentials to fetch REAL balances:
                <ul className="list-disc pl-5 mt-1">
                    <li><strong>Etherscan:</strong> For Ethereum (ETH) mainnet.</li>
                    <li><strong>BlockCypher:</strong> For ETH, BTC, LTC, DOGE, DASH (using the derived EVM address for all queries).</li>
                    <li><strong>Alchemy:</strong> For various EVM-compatible chains like Ethereum, Polygon, Arbitrum, Optimism, Base.</li>
                    <li><strong>Blockstream:</strong> For Bitcoin (BTC) mainnet.</li>
                    <li><strong>CryptoAPIs.io:</strong> For BTC, ETH, LTC, DOGE, DASH and other chains supported by their API.</li>
                    <li><strong>Mobula.io:</strong> For portfolio tracking across various chains. (Placeholder implementation for API call)</li>
                    <li><strong>Moralis:</strong> For EVM native and token balances across various chains.</li>
                    <li><strong>Bitquery.io:</strong> For querying various blockchains using GraphQL (ETH, BTC, etc.).</li>
                </ul>
            </li>
            <li>Addresses derived are EVM-compatible. Querying non-EVM chains (e.g., BTC via BlockCypher/Blockstream/CryptoAPIs.io/Mobula.io/Moralis/Bitquery) with an EVM address may not yield expected results for those specific non-EVM assets but is attempted. For accurate BTC balances from a seed phrase, a Bitcoin-specific derivation path (e.g., BIP44, BIP49, BIP84) and address generation is required, which is beyond the current scope for the seed phrase input method.</li>
            <li>If API keys/credentials are missing, invalid, rate-limited, or calls fail, results may show 0 balance or &quot;N/A&quot; datasource. Manual checks without keys are ineffective for real balances.</li>
            <li>The automatic generator REQUIRES at least one set of API credentials to function and find real balances.</li>
            <li><strong>Exposing real seed phrases can lead to PERMANENT LOSS OF FUNDS. Pre-filled API keys/credentials are for demonstration and may be rate-limited or revoked. Use your own for reliable use.</strong></li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card className="shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Input Seed Phrases & API Credentials</CardTitle>
          <CardDescription>
            Provide seed phrases (one per line, up to 1000) and your API credentials. At least one set of API credentials is needed for the automatic generator to find real balances.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div className="space-y-3 sm:col-span-2 lg:col-span-1 xl:col-span-1">
            <Textarea
              placeholder="Paste your seed phrases here, one per line..."
              value={seedPhrasesInput}
              onChange={(e) => setSeedPhrasesInput(e.target.value)}
              rows={8}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessingManual || isAutoGenerating}
              aria-label="Seed Phrases Input"
            />
             <div className="flex items-center space-x-2">
              <Button
                onClick={handleClearInput}
                disabled={isProcessingManual || isAutoGenerating || seedPhrasesInput.length === 0}
                variant="outline"
                className="w-full"
                aria-label="Clear Seed Phrases Input Button"
              >
                <Eraser className="mr-2 h-4 w-4" />
                Clear Input
              </Button>
            </div>
          </div>

          <div className="space-y-4">
             {/* Etherscan */}
            <div className="space-y-1">
                <div className="relative">
                  <Input
                    type={showEtherscanKey ? "text" : "password"}
                    placeholder="Etherscan API Key"
                    value={etherscanApiKeyInput}
                    onChange={(e) => setEtherscanApiKeyInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="Etherscan API Key Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowEtherscanKey(!showEtherscanKey)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showEtherscanKey ? "Hide Etherscan API Key" : "Show Etherscan API Key"}
                  >
                    {showEtherscanKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">Etherscan API</AlertTitle>
                  <AlertDescription>
                    For Ethereum (ETH) mainnet.
                  </AlertDescription>
                </Alert>
            </div>

            {/* BlockCypher */}
            <div className="space-y-1">
              <div className="relative">
                  <Input
                    type={showBlockcypherKey ? "text" : "password"}
                    placeholder="BlockCypher API Key"
                    value={blockcypherApiKeyInput}
                    onChange={(e) => setBlockcypherApiKeyInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="BlockCypher API Key Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowBlockcypherKey(!showBlockcypherKey)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showBlockcypherKey ? "Hide BlockCypher API Key" : "Show BlockCypher API Key"}
                  >
                    {showBlockcypherKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">BlockCypher API</AlertTitle>
                  <AlertDescription>
                    Checks ETH, BTC, LTC, DOGE, DASH.
                  </AlertDescription>
                </Alert>
            </div>
          </div>

          <div className="space-y-4">
            {/* Alchemy */}
            <div className="space-y-1">
                <div className="relative">
                  <Input
                    type={showAlchemyKey ? "text" : "password"}
                    placeholder="Alchemy API Key"
                    value={alchemyApiKeyInput}
                    onChange={(e) => setAlchemyApiKeyInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="Alchemy API Key Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowAlchemyKey(!showAlchemyKey)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showAlchemyKey ? "Hide Alchemy API Key" : "Show Alchemy API Key"}
                  >
                    {showAlchemyKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">Alchemy API</AlertTitle>
                  <AlertDescription>
                     ETH, Polygon, Arbitrum, Optimism, Base etc.
                  </AlertDescription>
                </Alert>
            </div>
            {/* Blockstream */}
             <div className="space-y-1">
                <div className="relative">
                  <Input
                    type={showBlockstreamClientId ? "text" : "password"}
                    placeholder="Blockstream Client ID (Optional)"
                    value={blockstreamClientIdInput}
                    onChange={(e) => setBlockstreamClientIdInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="Blockstream Client ID Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowBlockstreamClientId(!showBlockstreamClientId)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showBlockstreamClientId ? "Hide Blockstream Client ID" : "Show Blockstream Client ID"}
                  >
                    {showBlockstreamClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                 <div className="relative mt-2">
                  <Input
                    type={showBlockstreamClientSecret ? "text" : "password"}
                    placeholder="Blockstream Client Secret (Optional)"
                    value={blockstreamClientSecretInput}
                    onChange={(e) => setBlockstreamClientSecretInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="Blockstream Client Secret Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowBlockstreamClientSecret(!showBlockstreamClientSecret)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showBlockstreamClientSecret ? "Hide Blockstream Client Secret" : "Show Blockstream Client Secret"}
                  >
                    {showBlockstreamClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs mt-1">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">Blockstream API</AlertTitle>
                  <AlertDescription>
                    For Bitcoin (BTC). Public API; credentials may not be used by all endpoints.
                  </AlertDescription>
                </Alert>
            </div>
          </div>
          <div className="space-y-4">
             {/* CryptoAPIs.io */}
             <div className="space-y-1">
                <div className="relative">
                  <Input
                    type={showCryptoApisApiKey ? "text" : "password"}
                    placeholder="CryptoAPIs.io API Key"
                    value={cryptoApisApiKeyInput}
                    onChange={(e) => setCryptoApisApiKeyInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="CryptoAPIs.io API Key Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowCryptoApisApiKey(!showCryptoApisApiKey)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showCryptoApisApiKey ? "Hide CryptoAPIs.io API Key" : "Show CryptoAPIs.io API Key"}
                  >
                    {showCryptoApisApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">CryptoAPIs.io API</AlertTitle>
                  <AlertDescription>
                    For various chains like BTC, ETH, LTC etc.
                  </AlertDescription>
                </Alert>
            </div>
            {/* Mobula.io */}
             <div className="space-y-1">
                <div className="relative">
                  <Input
                    type={showMobulaApiKey ? "text" : "password"}
                    placeholder="Mobula.io API Key"
                    value={mobulaApiKeyInput}
                    onChange={(e) => setMobulaApiKeyInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="Mobula.io API Key Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowMobulaApiKey(!showMobulaApiKey)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showMobulaApiKey ? "Hide Mobula.io API Key" : "Show Mobula.io API Key"}
                  >
                    {showMobulaApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">Mobula.io API</AlertTitle>
                  <AlertDescription>
                    For multi-chain portfolio balances. (Placeholder API call logic)
                  </AlertDescription>
                </Alert>
            </div>
            {/* Moralis */}
            <div className="space-y-1">
                <div className="relative">
                  <Input
                    type={showMoralisApiKey ? "text" : "password"}
                    placeholder="Moralis API Key"
                    value={moralisApiKeyInput}
                    onChange={(e) => setMoralisApiKeyInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="Moralis API Key Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowMoralisApiKey(!showMoralisApiKey)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showMoralisApiKey ? "Hide Moralis API Key" : "Show Moralis API Key"}
                  >
                    {showMoralisApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">Moralis API</AlertTitle>
                  <AlertDescription>
                    For EVM native &amp; token balances.
                  </AlertDescription>
                </Alert>
            </div>
             {/* Bitquery.io */}
             <div className="space-y-1">
                <div className="relative">
                  <Input
                    type={showBitqueryApiKey ? "text" : "password"}
                    placeholder="Bitquery.io API Key"
                    value={bitqueryApiKeyInput}
                    onChange={(e) => setBitqueryApiKeyInput(e.target.value)}
                    className="text-sm border-input focus:ring-accent focus:border-accent font-mono pr-10"
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label="Bitquery.io API Key Input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowBitqueryApiKey(!showBitqueryApiKey)}
                    disabled={isProcessingManual || isAutoGenerating}
                    aria-label={showBitqueryApiKey ? "Hide Bitquery.io API Key" : "Show Bitquery.io API Key"}
                  >
                    {showBitqueryApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Alert variant="info" className="text-xs">
                  <DatabaseZap className="h-4 w-4" />
                  <AlertTitle className="font-semibold">Bitquery.io API</AlertTitle>
                  <AlertDescription>
                    GraphQL API for various blockchains.
                  </AlertDescription>
                </Alert>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            onClick={handleFetchBalances}
            disabled={isProcessingManual || isAutoGenerating || !seedPhrasesInput.trim()}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
            aria-label="Fetch Balances Button"
          >
            {isProcessingManual && !(isAutoGenerating && (currentGenerationStatus === 'Running' || currentGenerationStatus === 'Paused')) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Balances...
              </>
            ) : (
              <>
                <SearchCheck className="mr-2 h-4 w-4" />
                Fetch Balances {getFetchButtonTextSuffix()}
              </>
            )}
          </Button>
          <Button
            onClick={handleClearResults}
            disabled={isProcessingManual || isAutoGenerating || results.length === 0}
            variant="outline"
            className="w-full sm:w-auto"
            aria-label="Clear Results Button"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Results
          </Button>
        </CardFooter>
      </Card>

      <Card className="shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> Manual Seed Phrase Generation</CardTitle>
          <CardDescription>
            Manually generate a specific number of random seed phrases (varying lengths: 12, 15, 18, 21, 24 words) and check their balances.
            <strong>Requires at least one set of API credentials to be set above.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
             <Input
              type="number"
              min="1"
              max="100"
              placeholder="Number of Seed Phrases (1-100)"
              value={numSeedPhrasesToGenerate.toString()}
              onChange={(e) => setNumSeedPhrasesToGenerate(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono w-full md:w-1/3"
              disabled={isProcessingManual || isAutoGenerating}
              aria-label="Number of Seed Phrases to Generate Input"
            />
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            onClick={handleManualGenerateAndCheck}
            disabled={isProcessingManual || isAutoGenerating || (!etherscanApiKeyInputRef.current && !blockcypherApiKeyInputRef.current && !alchemyApiKeyInputRef.current && (!blockstreamClientIdInputRef.current || !blockstreamClientSecretInputRef.current) && !cryptoApisApiKeyInputRef.current && !mobulaApiKeyInputRef.current && !moralisApiKeyInputRef.current && !bitqueryApiKeyInputRef.current)}
            className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground"
            aria-label="Manual Generate and Check Seed Phrases Button"
          >
            {isProcessingManual && !(isAutoGenerating && (currentGenerationStatus === 'Running' || currentGenerationStatus === 'Paused')) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Settings2 className="mr-2 h-4 w-4" />
                Manual Generate & Check
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      <Card className="shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Automatic Seed Phrase Inspector</CardTitle>
          <CardDescription>
            Continuously generates and checks random seed phrases.
            The &quot;Number of Seed Phrases&quot; input above (default 100, max 100) controls the size of each generation &quot;batch&quot; for grouped logging and processing.
            <strong>Requires at least one set of API credentials to be set in the API Credentials section.</strong>
            Generator state (count, status, batch size) is persisted across refreshes unless explicitly stopped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">PHRASES IN CURRENT BATCH</p>
              <p className="text-5xl font-bold text-primary">{phrasesInBatchDisplay}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">SESSION TOTAL CHECKED</p>
              <p className="text-5xl font-bold text-primary">{checkedPhrasesCount}</p>
            </div>
          </div>
           <div className="text-center mt-4">
            <p className="text-lg font-semibold">
              Status: <span
                className={`font-bold ${
                  currentGenerationStatus === 'Running' ? 'text-green-500' :
                  currentGenerationStatus === 'Paused' ? 'text-amber-500' :
                  'text-red-500'
                }`}
              >
                {currentGenerationStatus}
                {currentGenerationStatus === 'Running' && <Loader2 className="inline-block ml-2 h-5 w-5 animate-spin" />}
              </span>
            </p>
          </div>
          <div className="flex justify-center space-x-3">
            {!isAutoGenerating || isAutoGenerationPaused ? (
              <Button
                onClick={() => startAutoGenerating(false)}
                disabled={isProcessingManual || (isAutoGenerating && !isAutoGenerationPaused) || (!etherscanApiKeyInputRef.current && !blockcypherApiKeyInputRef.current && !alchemyApiKeyInputRef.current && (!blockstreamClientIdInputRef.current || !blockstreamClientSecretInputRef.current) && !cryptoApisApiKeyInputRef.current && !mobulaApiKeyInputRef.current && !moralisApiKeyInputRef.current && !bitqueryApiKeyInputRef.current)}
                className="bg-green-600 hover:bg-green-700 text-white w-28"
                aria-label={isAutoGenerationPaused ? "Resume Generating" : "Start Generating"}
              >
                <Play className="mr-2 h-4 w-4" />
                {isAutoGenerationPaused ? 'Resume' : 'Start'}
              </Button>
            ) : (
              <Button
                onClick={pauseAutoGenerating}
                disabled={isProcessingManual}
                variant="secondary"
                className="bg-amber-500 hover:bg-amber-600 text-white w-28"
                aria-label="Pause Generating"
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            )}
            <Button
              onClick={() => stopAutoGenerating(true)}
              disabled={isProcessingManual || (!isAutoGenerating && !isAutoGenerationPaused) }
              variant="destructive"
              className="w-28"
              aria-label="Stop Generating"
            >
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          </div>
        </CardContent>
         {generationLogs.length > 0 && (
            <CardFooter className="flex-col items-start pt-4 border-t">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><ScrollText className="h-4 w-4"/>Generation Log:</h3>
              <ScrollArea className="h-[150px] w-full rounded-md border p-3 text-xs bg-muted/30">
                {generationLogs.map((log, index) => (
                  <div key={index} className="mb-1 last:mb-0">{log}</div>
                ))}
              </ScrollArea>
            </CardFooter>
         )}
      </Card>


      {results.length > 0 && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Balance Results (Wallets with Real Positive Balance)</CardTitle>
            <CardDescription>
              Etherscan API (masked): {etherscanApiKeyInputRef.current?.trim() ? maskValue(etherscanApiKeyInputRef.current, 4, 4) : 'N/A'}.{' '}
              BlockCypher API (masked): {blockcypherApiKeyInputRef.current?.trim() ? maskValue(blockcypherApiKeyInputRef.current, 4, 4) : 'N/A'}.{' '}
              Alchemy API (masked): {alchemyApiKeyInputRef.current?.trim() ? maskValue(alchemyApiKeyInputRef.current, 4, 4) : 'N/A'}.{' '}
              Blockstream Client ID (masked): {blockstreamClientIdInputRef.current?.trim() ? maskValue(blockstreamClientIdInputRef.current, 4, 4) : 'N/A'}.{' '}
              CryptoAPIs.io API (masked): {cryptoApisApiKeyInputRef.current?.trim() ? maskValue(cryptoApisApiKeyInputRef.current, 4, 4) : 'N/A'}.{' '}
              Mobula.io API (masked): {mobulaApiKeyInputRef.current?.trim() ? maskValue(mobulaApiKeyInputRef.current, 4, 4) : 'N/A'}.{' '}
              Moralis API (masked): {moralisApiKeyInputRef.current?.trim() ? maskValue(moralisApiKeyInputRef.current, 4, 4) : 'N/A'}.{' '}
              Bitquery.io API (masked): {bitqueryApiKeyInputRef.current?.trim() ? maskValue(bitqueryApiKeyInputRef.current, 4, 4) : 'N/A'}.{' '}
              Displaying up to {MAX_DISPLAYED_RESULTS} results with at least one non-zero balance from a real API (newest first).
              Showing BTC if available, otherwise first asset found; others indicated by (+X). Wallets with errors and no balance are not shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Derived EVM addresses and their balances. Only wallets with real balances &gt; 0 are shown.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Seed Phrase (Masked)</TableHead>
                  <TableHead className="w-[10%] text-center">Length</TableHead>
                  <TableHead className="w-[25%]">Derived Address (Masked)</TableHead>
                  <TableHead className="w-[15%] text-center">Wallet Type</TableHead>
                  <TableHead className="w-[10%] text-center">Primary Asset</TableHead>
                  <TableHead className="w-[10%] text-right">Balance</TableHead>
                  <TableHead className="w-[10%] text-center">Data Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={`${result.seedPhrase}-${index}-${result.derivedAddress}-${result.displayCryptoName}`} className={`hover:bg-secondary/50 ${result.error ? 'bg-red-50 dark:bg-red-900/30' : ''}`}>
                    <TableCell className="font-mono text-xs align-top">
                      <div className="flex items-center gap-1">
                        <span>{maskValue(result.seedPhrase, 4, 4)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
                          onClick={() => handleCopyText(result.seedPhrase, 'Seed Phrase')}
                          aria-label="Copy seed phrase"
                          disabled={!result.seedPhrase}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {result.error && <p className="text-destructive text-[10px] italic mt-1">{result.error}</p>}
                    </TableCell>
                    <TableCell className="text-center align-top text-xs">
                        {result.wordCount ? `${result.wordCount} words` : (result.seedPhrase?.split(' ').length || 'N/A')}
                    </TableCell>
                    <TableCell className="font-mono text-xs align-top">
                      {result.isLoading && !result.derivedAddress && <span>Deriving...</span>}
                      {result.derivedAddress ? (
                        <div className="flex items-center gap-1">
                          <span>{maskValue(result.derivedAddress, 6, 4)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => handleCopyText(result.derivedAddress, 'Derived Address')}
                            aria-label="Copy derived address"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <a href={
                            result.displayCryptoName?.toUpperCase() === "BTC" ? `https://blockstream.info/address/${result.derivedAddress}` :
                            result.displayCryptoName?.toUpperCase() === "LTC" ? `https://live.blockcypher.com/ltc/address/${result.derivedAddress}/` :
                            result.displayCryptoName?.toUpperCase() === "DOGE" ? `https://dogechain.info/address/${result.derivedAddress}` :
                            result.displayCryptoName?.toUpperCase() === "DASH" ? `https://explorer.dash.org/address/${result.derivedAddress}` :
                            `https://etherscan.io/address/${result.derivedAddress}`
                            } target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top text-xs">
                      {result.walletType ? (
                        <span className="inline-flex items-center gap-1">
                          <Network className="h-3 w-3 text-muted-foreground" />
                          {result.walletType}
                        </span>
                      ) : result.isLoading ? '' : '-'}
                    </TableCell>
                    <TableCell className="text-center align-top">
                       {result.displayCryptoName && result.displayCryptoName !== 'N/A' ? (
                        <span className={`inline-flex items-center gap-1 text-xs`}>
                          {<Coins className="h-3 w-3 text-muted-foreground" />}
                          {result.displayCryptoName}
                          {result.numOtherBalances && result.numOtherBalances > 0 ? (
                             <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="ml-1 text-accent cursor-help flex items-center">
                                     <PlusCircle className="h-3 w-3 mr-0.5"/> {result.numOtherBalances}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs p-2">
                                  <p>{result.numOtherBalances} other asset(s) with balance.</p>
                                  <p>Full multi-asset display coming soon!</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}
                        </span>
                      ) : result.isLoading ? '' : (result.displayBalance || 0) > 0 ? (result.displayCryptoName || '-') : '-'}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {result.isLoading && !result.displayBalance && <span className="text-muted-foreground text-xs">Loading...</span>}
                      {result.displayBalance && result.displayBalance > 0 ? (
                        <span className="flex items-center justify-end gap-1 font-medium text-xs">
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20 text-green-700 dark:text-green-400 text-[10px] font-bold shrink-0`}>
                            {getCurrencyIcon(result.displayCryptoName)}
                          </span>
                          {result.displayBalance.toFixed(result.displayCryptoName?.toUpperCase() === 'BTC' ? 8 : (result.displayCryptoName?.toUpperCase() === 'ETH' || result.displayCryptoName?.toUpperCase() === 'MATIC' || result.displayCryptoName?.toUpperCase() === 'ARBITRUM' || result.displayCryptoName?.toUpperCase() === 'OPTIMISM' || result.displayCryptoName?.toUpperCase() === 'BASE' ? 6 : 4) )}{' '}
                          <span className="text-muted-foreground text-[10px] shrink-0">{result.displayCryptoName?.split(' ')[0]}</span>
                        </span>
                      ) : !result.isLoading && result.balanceData && Array.isArray(result.balanceData) && result.balanceData.every(b => b.balance === 0) ? (
                         <span className="text-muted-foreground text-xs">0.0000</span>
                      ): (
                        !result.isLoading ? '-' : ''
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top text-xs">
                      {result.isLoading && !result.displayDataSource && <Loader2 className="h-4 w-4 animate-spin text-accent inline-block" />}
                      {result.displayDataSource ? (
                        getDataSourceTag(result.displayDataSource)
                      ) : (
                        !result.isLoading ? '-' : ''
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
