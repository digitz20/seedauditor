// @ts-nocheck
'use client';

import * as React from 'react';
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
import { Activity, Terminal, Loader2, Wallet, Network, Coins, Copy, Eraser, Trash2, KeyRound, Info, ExternalLink, SearchCheck, ShieldAlert, DatabaseZap, Pause, Play, Square, Settings2, ListChecks, ScrollText, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { processSeedPhrasesAndFetchBalances, type ProcessedWalletInfo, type AddressBalanceResult } from './actions';
import { generateAndCheckSeedPhrases, type GenerateAndCheckSeedPhrasesOutput, type GenerateAndCheckSeedPhrasesInput, type SingleSeedPhraseResultSchema as FlowSingleSeedPhraseResultSchema } from '@/ai/flows/random-seed-phrase'; // Adjusted import for clarity
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface ResultRow extends Omit<ProcessedWalletInfo, 'balanceData' | 'cryptoName'> {
  isLoading: boolean;
  wordCount?: number;
  // Store all balances
  balanceData: AddressBalanceResult[] | null; 
  // For display purposes, we'll pick the first non-zero balance's cryptoName.
  displayCryptoName?: string | null; 
  displayBalance?: number | null;
  displayDataSource?: AddressBalanceResult['dataSource'] | null;
  numOtherBalances?: number; // Number of other positive balances not displayed
}


const MAX_DISPLAYED_RESULTS = 500; 

export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>('');
  const [etherscanApiKeyInput, setEtherscanApiKeyInput] = useState<string>(process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || 'ZKPID4755Q9BJZVXXZ96M3N6RSXYE7NTRV');
  const [blockcypherApiKeyInput, setBlockcypherApiKeyInput] = useState<string>(process.env.NEXT_PUBLIC_BLOCKCYPHER_API_KEY || '41ccb7c601ef4bad99b3698cfcea9a8c');
  const [alchemyApiKeyInput, setAlchemyApiKeyInput] = useState<string>(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || 'p4UZuRIRutN5yn06iKDjOcAX2nB75ZRp');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessingManual, setIsProcessingManual] = useState<boolean>(false);
  const [numSeedPhrasesToGenerate, setNumSeedPhrasesToGenerate] = useState<number>(10);

  const { toast } = useToast();

  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isAutoGenerationPaused, setIsAutoGenerationPaused] = useState(false);
  const [checkedPhrasesCount, setCheckedPhrasesCount] = useState<number>(0);
  const [currentGenerationStatus, setCurrentGenerationStatus] = useState<'Stopped' | 'Running' | 'Paused'>('Stopped');
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const MAX_LOGS = 100;
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isAutoGeneratingRef = useRef(isAutoGenerating);
  const isAutoGenerationPausedRef = useRef(isAutoGenerationPaused);
  const numSeedPhrasesToGenerateRef = useRef(numSeedPhrasesToGenerate);
  const etherscanApiKeyInputRef = useRef(etherscanApiKeyInput);
  const blockcypherApiKeyInputRef = useRef(blockcypherApiKeyInput);
  const alchemyApiKeyInputRef = useRef(alchemyApiKeyInput);


  useEffect(() => { isAutoGeneratingRef.current = isAutoGenerating; }, [isAutoGenerating]);
  useEffect(() => { isAutoGenerationPausedRef.current = isAutoGenerationPaused; }, [isAutoGenerationPaused]);
  useEffect(() => { numSeedPhrasesToGenerateRef.current = numSeedPhrasesToGenerate; }, [numSeedPhrasesToGenerate]);
  useEffect(() => { etherscanApiKeyInputRef.current = etherscanApiKeyInput; }, [etherscanApiKeyInput]);
  useEffect(() => { blockcypherApiKeyInputRef.current = blockcypherApiKeyInput; }, [blockcypherApiKeyInput]);
  useEffect(() => { alchemyApiKeyInputRef.current = alchemyApiKeyInput; }, [alchemyApiKeyInput]);


  const addLogMessage = useCallback((message: string) => {
    setGenerationLogs(prevLogs => {
      const newLogs = [`[${new Date().toLocaleTimeString()}] ${message}`, ...prevLogs];
      return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
    });
  }, []);

  const processAndSetDisplayBalances = (data: ProcessedWalletInfo[] | GenerateAndCheckSeedPhrasesOutput, isFromFlow: boolean = false): ResultRow[] => {
    return data.map(item => {
      let firstRealPositiveBalance: AddressBalanceResult | undefined;
      let allPositiveBalances: AddressBalanceResult[] = [];
      let wordCountVal: number;
      let itemBalances: any[] = []; // To hold either item.balanceData or item.balances

      if (isFromFlow) {
        const flowItem = item as FlowSingleSeedPhraseResultSchema;
        itemBalances = flowItem.balances || [];
        allPositiveBalances = itemBalances
            .filter(b => b.balance > 0)
            .map(b => ({
                address: flowItem.derivedAddress,
                balance: b.balance,
                currency: b.cryptoName,
                isRealData: ['Etherscan API', 'BlockCypher API', 'Alchemy API'].includes(b.dataSource),
                dataSource: b.dataSource as AddressBalanceResult['dataSource'],
            }));
        wordCountVal = flowItem.wordCount;
      } else { 
        const actionItem = item as ProcessedWalletInfo;
        itemBalances = actionItem.balanceData || [];
        allPositiveBalances = itemBalances.filter(bal => bal.balance > 0 && bal.isRealData);
        wordCountVal = actionItem.seedPhrase.split(' ').length;
      }
      
      firstRealPositiveBalance = allPositiveBalances.length > 0 ? allPositiveBalances[0] : undefined;

      return {
        seedPhrase: item.seedPhrase,
        derivedAddress: item.derivedAddress,
        walletType: item.walletType,
        balanceData: itemBalances.map(b => ({ // Store all original balances correctly mapped
             address: item.derivedAddress,
             balance: b.balance,
             currency: b.currency || b.cryptoName, // Adapt based on source structure
             isRealData: b.isRealData !== undefined ? b.isRealData : ['Etherscan API', 'BlockCypher API', 'Alchemy API'].includes(b.dataSource),
             dataSource: b.dataSource as AddressBalanceResult['dataSource'],
        })),
        error: item.error || null,
        derivationError: item.derivationError || null,
        isLoading: false,
        wordCount: wordCountVal,
        displayCryptoName: firstRealPositiveBalance?.currency,
        displayBalance: firstRealPositiveBalance?.balance,
        displayDataSource: firstRealPositiveBalance?.dataSource,
        numOtherBalances: allPositiveBalances.length > 1 ? allPositiveBalances.length - 1 : 0,
      };
    });
  };


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

    const hasEtherscanKey = etherscanApiKeyInput.trim();
    const hasBlockcypherKey = blockcypherApiKeyInput.trim();
    const hasAlchemyKey = alchemyApiKeyInput.trim();
    
    if (!hasEtherscanKey && !hasBlockcypherKey && !hasAlchemyKey) {
      toast({
        title: 'API Key Recommended for Real Balances',
        description: 'Provide Etherscan, BlockCypher, or Alchemy API key. Manual checks without keys will show N/A or errors, and no balances will be found.',
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
    const validPhrases = phrases.filter(phrase => {
        const wordCount = phrase.split(' ').length;
        return [12, 15, 18, 21, 24].includes(wordCount);
    });

    setResults(
      validPhrases.map((phrase) => ({
        seedPhrase: phrase,
        derivedAddress: null,
        walletType: null,
        balanceData: [], 
        error: null,
        derivationError: null,
        isLoading: true,
        wordCount: phrase.split(' ').length,
        displayCryptoName: null,
        displayBalance: null,
        displayDataSource: null,
        numOtherBalances: 0,
      }))
    );

    try {
      const processedDataFromAction = await processSeedPhrasesAndFetchBalances(
        validPhrases,
        etherscanApiKeyInputRef.current || undefined,
        blockcypherApiKeyInputRef.current || undefined,
        alchemyApiKeyInputRef.current || undefined
      );
      
      const finalResults = processAndSetDisplayBalances(processedDataFromAction, false);
      setResults(finalResults);


      let toastMessage = `Finished processing ${phrases.length} seed phrases. `;
      toastMessage += `Found ${finalResults.length} wallet(s) with at least one non-zero balance.`;
      
      if (!hasEtherscanKey && !hasBlockcypherKey && !hasAlchemyKey && phrases.length > 0) {
        toastMessage += ' No API keys were provided, so no real balances could be fetched.';
      }

      toast({
        title: 'Balance Check Complete',
        description: toastMessage,
      });

    } catch (error: any) {
      console.error("General error during balance fetching process:", error);
      toast({
        title: 'Processing Error',
        description: `An unexpected error occurred: ${error.message}. Some results might be incomplete.`,
        variant: 'destructive',
      });
       setResults(prevResults => prevResults.map(r => ({ ...r, isLoading: false, error: r.isLoading ? (r.error || "Overall process failed") : r.error })));
    }

    setIsProcessingManual(false);
  };

  const handleManualGenerateAndCheck = async () => {
    if (!etherscanApiKeyInputRef.current && !blockcypherApiKeyInputRef.current && !alchemyApiKeyInputRef.current) {
      toast({
        title: 'API Key(s) Required',
        description: 'Please provide at least one API key (Etherscan, BlockCypher, or Alchemy) for the generator to fetch real balances.',
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
      };

      const generatedDataFromFlow: GenerateAndCheckSeedPhrasesOutput = await generateAndCheckSeedPhrases(input);
      const processedResults = processAndSetDisplayBalances(generatedDataFromFlow, true);
      
      addLogMessage(`Manual generation: Received ${processedResults.length} phrases with balance from ${numSeedPhrasesToGenerateRef.current} generated.`);
      setResults(prevResults => [...processedResults, ...prevResults].slice(0, MAX_DISPLAYED_RESULTS));

      toast({
        title: 'Seed Phrases Generated and Checked',
        description: `Generated and checked ${numSeedPhrasesToGenerateRef.current} seed phrases. Found ${processedResults.length} with balance.`,
      });
    } catch (error: any) {
      console.error("Error generating and checking seed phrases:", error);
      addLogMessage(`Manual generation error: ${error.message}`);
      toast({
        title: 'Generation and Check Error',
        description: `An error occurred: ${error.message}`,
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

  const runAutoGenerationStep = useCallback(async () => {
    if (!isAutoGeneratingRef.current || isAutoGenerationPausedRef.current) {
      setCurrentGenerationStatus(isAutoGenerationPausedRef.current ? 'Paused' : 'Stopped');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return;
    }
    
    setCurrentGenerationStatus('Running'); 

    if (!etherscanApiKeyInputRef.current && !blockcypherApiKeyInputRef.current && !alchemyApiKeyInputRef.current) {
      addLogMessage('Auto-generation stopped: At least one API key is required to check real balances.');
      stopAutoGenerating(); 
      toast({
        title: 'API Key(s) Required for Auto-Generation',
        description: 'Please provide at least one API key (Etherscan, BlockCypher, or Alchemy) to start auto-generation.',
        variant: 'destructive',
      });
      return;
    }

    const currentNumToGenerate = numSeedPhrasesToGenerateRef.current > 0 ? numSeedPhrasesToGenerateRef.current : 1;
    addLogMessage(`Generating batch of ${currentNumToGenerate} seed phrases... (Total checked: ${checkedPhrasesCount})`);
    let processedResultsFromFlow = [];
    try {
      const input: GenerateAndCheckSeedPhrasesInput = {
        numSeedPhrases: currentNumToGenerate,
        etherscanApiKey: etherscanApiKeyInputRef.current || undefined,
        blockcypherApiKey: blockcypherApiKeyInputRef.current || undefined,
        alchemyApiKey: alchemyApiKeyInputRef.current || undefined,
      };

      const generatedDataFromFlow: GenerateAndCheckSeedPhrasesOutput = await generateAndCheckSeedPhrases(input);
      processedResultsFromFlow = processAndSetDisplayBalances(generatedDataFromFlow, true); // Renamed to avoid conflict
            
      setCheckedPhrasesCount(prevCount => prevCount + currentNumToGenerate);
      
      if (processedResultsFromFlow.length > 0) {
        setResults(prevResults => [...processedResultsFromFlow, ...prevResults].slice(0, MAX_DISPLAYED_RESULTS));
        addLogMessage(`Found ${processedResultsFromFlow.length} wallet(s) with balance in this batch. Results updated.`);
      }

    } catch (error: any) {
      console.error("Error during automatic seed phrase generation batch:", error);
      addLogMessage(`Error in generation batch: ${error.message}`);
       if (error.message?.includes("rate limit") || error.message?.includes("API key quota exceeded") || error.message?.includes("blocked")) {
        addLogMessage("Rate limit or block likely hit. Pausing generation for 1 minute.");
        pauseAutoGenerating();
        timeoutRef.current = setTimeout(() => {
          if(isAutoGeneratingRef.current && isAutoGenerationPausedRef.current) { 
             addLogMessage("Attempting to resume auto-generation after rate limit pause.");
             startAutoGenerating(); 
          }
        }, 60000); 
      }
    }

    if (isAutoGeneratingRef.current && !isAutoGenerationPausedRef.current) {
      const delay = processedResultsFromFlow && processedResultsFromFlow.length > 0 ? 300 : 500; 
      timeoutRef.current = setTimeout(runAutoGenerationStep, delay); 
    } else {
       setCurrentGenerationStatus(isAutoGenerationPausedRef.current ? 'Paused' : 'Stopped');
       if (timeoutRef.current) clearTimeout(timeoutRef.current);
       timeoutRef.current = null;
    }
  }, [addLogMessage, checkedPhrasesCount, toast, processAndSetDisplayBalances]);

  const startAutoGenerating = () => {
    const wasPaused = isAutoGenerationPausedRef.current;
    if (!isAutoGeneratingRef.current || wasPaused) {
        addLogMessage(wasPaused ? 'Resuming automatic seed phrase generation...' : 'Starting automatic seed phrase generation...');
        if (!wasPaused) setCheckedPhrasesCount(0);
    }
    
    setIsAutoGenerating(true);
    setIsAutoGenerationPaused(false); 
    setCurrentGenerationStatus('Running');
    
    isAutoGeneratingRef.current = true;
    isAutoGenerationPausedRef.current = false;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    runAutoGenerationStep();
  };

  const pauseAutoGenerating = () => {
    if (!isAutoGeneratingRef.current || isAutoGenerationPausedRef.current) return;
    addLogMessage('Pausing automatic seed phrase generation.');
    setIsAutoGenerationPaused(true); 
    setCurrentGenerationStatus('Paused');
    isAutoGenerationPausedRef.current = true; 
     if (timeoutRef.current) { 
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const stopAutoGenerating = () => {
    if (!isAutoGeneratingRef.current) return;
    addLogMessage('Stopped automatic seed phrase generation.');
    setIsAutoGenerating(false);
    setIsAutoGenerationPaused(false); 
    setCurrentGenerationStatus('Stopped');
    
    isAutoGeneratingRef.current = false;
    isAutoGenerationPausedRef.current = false;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };
  
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
    if (upperSymbol.includes('ETH')) return 'Ξ';
    if (upperSymbol.includes('BTC')) return '₿';
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

  const getDataSourceTag = (dataSource: AddressBalanceResult['dataSource'] | undefined | null) => {
    switch (dataSource) {
      case 'Etherscan API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300">Etherscan</span>;
      case 'BlockCypher API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-300">BlockCypher</span>;
      case 'Alchemy API':
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-800/30 dark:text-purple-300">Alchemy</span>;
      case 'Simulated Fallback': 
         return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-800/30 dark:text-amber-300">Simulated</span>;
      case 'N/A':
      case 'Unknown':
      default:
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300">{dataSource || 'N/A'}</span>;
    }
  };

 const getFetchButtonTextSuffix = () => {
    const keys = [];
    if (etherscanApiKeyInputRef.current?.trim()) keys.push('Etherscan');
    if (blockcypherApiKeyInputRef.current?.trim()) keys.push('BlockCypher');
    if (alchemyApiKeyInputRef.current?.trim()) keys.push('Alchemy');
    
    if (keys.length === 0) return ' (No API Keys - Manual Check Ineffective)';
    if (keys.length === 1) return ` (Use ${keys[0]} API)`;
    if (keys.length === 2) return ` (Use ${keys.join(' & ')} APIs)`;
    return ' (Use All API Keys)';
  };
  

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-2">
          <Wallet className="h-8 w-8" /> Balance Auditor
        </h1>
        <p className="text-muted-foreground">
          Enter seed phrases and API keys to derive EVM addresses and fetch real balances across multiple supported chains. Or, use the automatic generator.
        </p>
      </header>

      <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/50 text-destructive dark:text-destructive [&>svg]:text-destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Critical Security Warning & Usage Notice</AlertTitle>
        <AlertDescription>
          <strong>NEVER enter REAL seed phrases from wallets with significant funds into ANY online tool you do not fully trust and haven't audited.</strong>
          This application is for demonstration and educational purposes.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>It uses <code>ethers.js</code> for LOCAL address derivation (EVM-compatible). Your seed phrases are NOT sent to any server for derivation.</li>
            <li>It WILL attempt to use provided API keys to fetch REAL balances:
                <ul className="list-disc pl-5 mt-1">
                    <li><strong>Etherscan:</strong> For Ethereum (ETH) mainnet.</li>
                    <li><strong>BlockCypher:</strong> For ETH, BTC, LTC, DOGE, DASH (using the derived EVM address for all queries).</li>
                    <li><strong>Alchemy:</strong> For various EVM-compatible chains like Ethereum, Polygon, Arbitrum, Optimism, Base.</li>
                </ul>
            </li>
            <li>Addresses derived are EVM-compatible. Querying non-EVM chains (e.g., BTC via BlockCypher) with an EVM address may not yield expected results for those specific non-EVM assets but is attempted.</li>
            <li>If API keys are missing, invalid, rate-limited, or calls fail, results may show 0 balance or "N/A" datasource. Manual checks without keys are ineffective for real balances.</li>
            <li>The automatic generator REQUIRES at least one API key to function and find real balances.</li>
            <li><strong>Exposing real seed phrases can lead to PERMANENT LOSS OF FUNDS. Pre-filled API keys are for demonstration and may be rate-limited or revoked. Use your own keys for reliable use.</strong></li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card className="shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Input Seed Phrases & API Keys</CardTitle>
          <CardDescription>
            Provide seed phrases (one per line, up to 1000) and your API keys. At least one API key is needed for the automatic generator to find real balances.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="md:col-span-2 lg:col-span-1 space-y-3">
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
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Enter Etherscan API Key"
              value={etherscanApiKeyInput}
              onChange={(e) => setEtherscanApiKeyInput(e.target.value)}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessingManual || isAutoGenerating}
              aria-label="Etherscan API Key Input"
            />
            <Alert variant="info" className="text-xs mt-2">
              <DatabaseZap className="h-4 w-4" />
              <AlertTitle className="font-semibold">Etherscan API</AlertTitle>
              <AlertDescription>
                For Ethereum (ETH) mainnet balances.
              </AlertDescription>
            </Alert>
          </div>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Enter BlockCypher API Key"
              value={blockcypherApiKeyInput}
              onChange={(e) => setBlockcypherApiKeyInput(e.target.value)}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessingManual || isAutoGenerating}
              aria-label="BlockCypher API Key Input"
            />
            <Alert variant="info" className="text-xs mt-2">
              <DatabaseZap className="h-4 w-4" />
              <AlertTitle className="font-semibold">BlockCypher API</AlertTitle>
              <AlertDescription>
                Checks ETH, BTC, LTC, DOGE, DASH (uses EVM address for all queries).
              </AlertDescription>
            </Alert>
          </div>
           <div className="space-y-3">
            <Input
              type="password"
              placeholder="Enter Alchemy API Key"
              value={alchemyApiKeyInput}
              onChange={(e) => setAlchemyApiKeyInput(e.target.value)}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessingManual || isAutoGenerating}
              aria-label="Alchemy API Key Input"
            />
            <Alert variant="info" className="text-xs mt-2">
              <DatabaseZap className="h-4 w-4" />
              <AlertTitle className="font-semibold">Alchemy API</AlertTitle>
              <AlertDescription>
                For balances on various EVM chains (ETH, Polygon, Arbitrum, Optimism, Base etc.).
              </AlertDescription>
            </Alert>
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
            <strong>Requires at least one API key to be set above.</strong>
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
            disabled={isProcessingManual || isAutoGenerating || (!etherscanApiKeyInputRef.current && !blockcypherApiKeyInputRef.current && !alchemyApiKeyInputRef.current)}
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
            Continuously generates random seed phrases (varying lengths) and checks for balances.
            Batch size for generation is set by the "Number of Seed Phrases" input field above (default 10, max 100).
            <strong>Requires at least one API key to be set in the API Keys section.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">PHRASES CHECKED THIS SESSION</p>
            <p className="text-5xl font-bold mb-2 text-primary">{checkedPhrasesCount}</p>
            <p className="text-lg font-semibold">
              Status: <span
                className={`font-bold ${
                  currentGenerationStatus === 'Running' ? 'text-green-500' :
                  currentGenerationStatus === 'Paused' ? 'text-amber-500' :
                  'text-red-500'
                }`}
              >
                {currentGenerationStatus}
              </span>
            </p>
          </div>
          <div className="flex justify-center space-x-3">
            {!isAutoGenerating || isAutoGenerationPaused ? (
              <Button
                onClick={startAutoGenerating}
                disabled={isProcessingManual || (isAutoGenerating && !isAutoGenerationPaused) || (!etherscanApiKeyInputRef.current && !blockcypherApiKeyInputRef.current && !alchemyApiKeyInputRef.current)}
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
              onClick={stopAutoGenerating}
              disabled={isProcessingManual || !isAutoGenerating}
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
              Etherscan API (masked): {etherscanApiKeyInputRef.current?.trim() ? maskValue(etherscanApiKeyInputRef.current, 4, 4) : 'N/A'}.
              BlockCypher API (masked): {blockcypherApiKeyInputRef.current?.trim() ? maskValue(blockcypherApiKeyInputRef.current, 4, 4) : 'N/A'}.
              Alchemy API (masked): {alchemyApiKeyInputRef.current?.trim() ? maskValue(alchemyApiKeyInputRef.current, 4, 4) : 'N/A'}.
              Displaying up to {MAX_DISPLAYED_RESULTS} results with at least one non-zero balance from a real API (newest first). 
              Showing first asset found; others indicated by (+X).
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
                  <TableRow key={`${result.seedPhrase}-${index}-${result.derivedAddress}-${result.displayCryptoName}`} className={`hover:bg-secondary/50 ${result.derivationError ? 'bg-red-50 dark:bg-red-900/30' : ''}`}>
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
                      {result.derivationError && <p className="text-destructive text-[10px] italic mt-1">Derivation: {result.derivationError}</p>}
                      {result.error && !result.derivationError && <p className="text-destructive text-[10px] italic mt-1">{result.error}</p>}
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
                            result.displayCryptoName?.toUpperCase() === "BTC" ? `https://www.blockchain.com/explorer/addresses/btc/${result.derivedAddress}` : 
                            result.displayCryptoName?.toUpperCase() === "LTC" ? `https://live.blockcypher.com/ltc/address/${result.derivedAddress}/` :
                            result.displayCryptoName?.toUpperCase() === "DOGE" ? `https://dogechain.info/address/${result.derivedAddress}` :
                            result.displayCryptoName?.toUpperCase() === "DASH" ? `https://explorer.dash.org/address/${result.derivedAddress}` :
                            `https://etherscan.io/address/${result.derivedAddress}`
                            } target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : result.derivationError ? (
                        <span className="text-destructive text-xs italic">Derivation Failed</span>
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
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Coins className="h-3 w-3 text-muted-foreground" />
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
                          {result.displayBalance.toFixed(6)}{' '}
                          <span className="text-muted-foreground text-[10px] shrink-0">{result.displayCryptoName?.split(' ')[0]}</span>
                        </span>
                      ) : !result.isLoading && result.balanceData && result.balanceData.length > 0 && result.balanceData.every(b => b.balance === 0) ? (
                         <span className="text-muted-foreground text-xs">0.000000 {result.displayCryptoName !== 'N/A' ? result.displayCryptoName?.split(' ')[0] : ''}</span>
                      ): result.error && !result.derivationError ? (
                        <span className="text-destructive text-xs italic">Fetch Error</span>
                      ) : (
                        !result.isLoading && '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top text-xs">
                      {result.isLoading && !result.displayDataSource && <Loader2 className="h-4 w-4 animate-spin text-accent inline-block" />}
                      {result.displayDataSource ? (
                        getDataSourceTag(result.displayDataSource)
                      ) : result.derivationError ? (
                        '-'
                      ) : result.error && !result.isLoading ? (
                         getDataSourceTag('N/A') 
                      ) : (
                        !result.isLoading && '-'
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
