// @ts-nocheck
'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
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
import { Activity, Terminal, Loader2, Wallet, Network, Coins, Copy, Eraser, Trash2, KeyRound, Info, ExternalLink, SearchCheck, ShieldAlert, DatabaseZap, Pause, Play, Square, Settings2, ListChecks, ScrollText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { processSeedPhrasesAndFetchBalances, type ProcessedWalletInfo, type AddressBalanceResult } from './actions';
import { generateAndCheckSeedPhrases, type GenerateAndCheckSeedPhrasesOutput } from '@/ai/flows/random-seed-phrase';


interface ResultRow extends ProcessedWalletInfo {
  isLoading: boolean;
  wordCount?: number; // Added optional wordCount
}

const MAX_DISPLAYED_RESULTS = 500; // Max results to keep in the table for performance

export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>('');
  const [etherscanApiKeyInput, setEtherscanApiKeyInput] = useState<string>('ZKPID4755Q9BJZVXXZ96M3N6RSXYE7NTRV');
  const [blockcypherApiKeyInput, setBlockcypherApiKeyInput] = useState<string>('41ccb7c601ef4bad99b3698cfcea9a8c');
  const [alchemyApiKeyInput, setAlchemyApiKeyInput] = useState<string>('p4UZuRIRutN5yn06iKDjOcAX2nB75ZRp');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessingManual, setIsProcessingManual] = useState<boolean>(false);
  const [numSeedPhrasesToGenerate, setNumSeedPhrasesToGenerate] = useState<number>(1);

  const { toast } = useToast();

  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isAutoGenerationPaused, setIsAutoGenerationPaused] = useState(false);
  const [checkedPhrasesCount, setCheckedPhrasesCount] = useState<number>(0);
  const [currentGenerationStatus, setCurrentGenerationStatus] = useState<'Stopped' | 'Running' | 'Paused'>('Stopped');
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const MAX_LOGS = 100;
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for state values to be used in async callbacks (avoid stale closures)
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


  const addLogMessage = (message: string) => {
    setGenerationLogs(prevLogs => {
      const newLogs = [`[${new Date().toLocaleTimeString()}] ${message}`, ...prevLogs];
      return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
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
    
    let keyWarnings = [];
    if (!hasEtherscanKey && !hasBlockcypherKey && !hasAlchemyKey) {
      toast({
        title: 'API Key Recommended',
        description: 'Please enter an Etherscan, BlockCypher, or Alchemy API key for real balances. Balances will be simulated.',
        variant: 'default',
      });
       // For manual input, if no keys, we will still proceed with simulation.
    } else {
        if (!hasEtherscanKey) keyWarnings.push("Etherscan");
        if (!hasBlockcypherKey) keyWarnings.push("BlockCypher");
        if (!hasAlchemyKey) keyWarnings.push("Alchemy");
        if (keyWarnings.length > 0 && keyWarnings.length < 3) {
             toast({
                title: `${keyWarnings.join(' & ')} API Key(s) Missing`,
                description: `Will attempt to use available keys or simulate if all fail.`,
                variant: 'default',
            });
        }
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
    setResults(
      phrases.map((phrase) => ({
        seedPhrase: phrase,
        derivedAddress: null,
        walletType: null,
        cryptoName: null,
        balanceData: null,
        error: null,
        derivationError: null,
        isLoading: true,
        wordCount: phrase.split(' ').length, // Estimate word count for manual input
      }))
    );

    try {
      const processedData = await processSeedPhrasesAndFetchBalances(
        phrases,
        etherscanApiKeyInput || undefined,
        blockcypherApiKeyInput || undefined,
        alchemyApiKeyInput || undefined
      );

      setResults(processedData.map(data => ({ ...data, isLoading: false, wordCount: data.seedPhrase.split(' ').length })));

      let toastMessage = `Finished processing ${phrases.length} seed phrases. `;
      const usedApis = [];
      if (hasEtherscanKey) usedApis.push('Etherscan');
      if (hasBlockcypherKey) usedApis.push('BlockCypher');
      if (hasAlchemyKey) usedApis.push('Alchemy');

      if (usedApis.length > 0) {
        toastMessage += `Attempted to fetch real balances using ${usedApis.join(', ')}.`;
      } else {
        toastMessage += 'No API keys provided; balances are simulated.';
      }
      

      toast({
        title: 'Balance Fetch Complete',
        description: toastMessage,
      });

    } catch (error: any) {
      console.error("General error during balance fetching process:", error);
      toast({
        title: 'Processing Error',
        description: `An unexpected error occurred: ${error.message}. Some results might be incomplete.`,
        variant: 'destructive',
      });
      setResults(prevResults => prevResults.map(r => ({ ...r, isLoading: false, error: r.error || "Overall process failed" })));
    }

    setIsProcessingManual(false);
  };

  const handleManualGenerateAndCheck = async () => {
    setIsProcessingManual(true);
    addLogMessage(`Manual generation: Requesting ${numSeedPhrasesToGenerate} phrases...`);
    try {
      const input = {
        numSeedPhrases: numSeedPhrasesToGenerate,
        etherscanApiKey: etherscanApiKeyInputRef.current || '',
        blockcypherApiKey: blockcypherApiKeyInputRef.current || '',
        alchemyApiKey: alchemyApiKeyInputRef.current || '',
      };

      const generatedData: GenerateAndCheckSeedPhrasesOutput = await generateAndCheckSeedPhrases(input);

      const processedData = generatedData.map(item => ({
        seedPhrase: item.seedPhrase,
        derivedAddress: item.derivedAddress,
        walletType: item.walletType,
        cryptoName: item.cryptoName,
        balanceData: {
          address: item.derivedAddress,
          balance: item.balance,
          currency: item.cryptoName,
          isRealData: ['Etherscan API', 'BlockCypher API', 'Alchemy API'].includes(item.dataSource),
          dataSource: item.dataSource,
        },
        error: null,
        derivationError: null,
        isLoading: false,
        wordCount: item.wordCount, // Map wordCount from flow output
      }));
      
      addLogMessage(`Manual generation: Received ${generatedData.length} phrases. Found ${processedData.length} with balance.`);
      setResults(prevResults => [...processedData, ...prevResults].slice(-MAX_DISPLAYED_RESULTS)); // Prepend new results

      toast({
        title: 'Seed Phrases Generated and Checked',
        description: `Generated ${numSeedPhrasesToGenerate} seed phrases of various lengths. Found ${processedData.length} with balance.`,
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


  const runAutoGenerationStep = async () => {
    if (!isAutoGeneratingRef.current || isAutoGenerationPausedRef.current) {
      setCurrentGenerationStatus(isAutoGenerationPausedRef.current ? 'Paused' : 'Stopped');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return;
    }
    
    setCurrentGenerationStatus('Running'); 

    const currentNumToGenerate = numSeedPhrasesToGenerateRef.current > 0 ? numSeedPhrasesToGenerateRef.current : 1;
    addLogMessage(`Generating batch of ${currentNumToGenerate} seed phrases... (Total checked: ${checkedPhrasesCount})`);

    try {
      const input = {
        numSeedPhrases: currentNumToGenerate,
        etherscanApiKey: etherscanApiKeyInputRef.current || '',
        blockcypherApiKey: blockcypherApiKeyInputRef.current || '',
        alchemyApiKey: alchemyApiKeyInputRef.current || '',
      };

      const generatedData: GenerateAndCheckSeedPhrasesOutput = await generateAndCheckSeedPhrases(input);
      
      const processedData = generatedData.map(item => ({
        seedPhrase: item.seedPhrase,
        derivedAddress: item.derivedAddress,
        walletType: item.walletType,
        cryptoName: item.cryptoName,
        balanceData: {
          address: item.derivedAddress,
          balance: item.balance,
          currency: item.cryptoName,
          isRealData: ['Etherscan API', 'BlockCypher API', 'Alchemy API'].includes(item.dataSource),
          dataSource: item.dataSource,
        },
        error: null,
        derivationError: null,
        isLoading: false,
        wordCount: item.wordCount, // Map wordCount from flow output
      }));
      
      setCheckedPhrasesCount(prevCount => prevCount + currentNumToGenerate);
      
      if (processedData.length > 0) {
        setResults(prevResults => [...processedData, ...prevResults].slice(-MAX_DISPLAYED_RESULTS)); // Prepend new results
        addLogMessage(`Found ${processedData.length} wallet(s) with balance in this batch. Results updated.`);
      }

    } catch (error: any) {
      console.error("Error during automatic seed phrase generation batch:", error);
      addLogMessage(`Error in generation batch: ${error.message}`);
    }

    if (isAutoGeneratingRef.current && !isAutoGenerationPausedRef.current) {
      timeoutRef.current = setTimeout(runAutoGenerationStep, 1000); 
    } else {
       setCurrentGenerationStatus(isAutoGenerationPausedRef.current ? 'Paused' : 'Stopped');
       if (timeoutRef.current) clearTimeout(timeoutRef.current);
       timeoutRef.current = null;
    }
  };

  const startAutoGenerating = () => {
    addLogMessage('Starting automatic seed phrase generation...');
    setIsAutoGenerating(true);
    setIsAutoGenerationPaused(false);
    setCurrentGenerationStatus('Running');
    
    if (!isAutoGenerationPausedRef.current) { 
        setCheckedPhrasesCount(0);
        setGenerationLogs(['Automatic generation started.']); 
    }


    isAutoGeneratingRef.current = true;
    isAutoGenerationPausedRef.current = false;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    runAutoGenerationStep();
  };

  const pauseAutoGenerating = () => {
    addLogMessage('Pausing automatic seed phrase generation.');
    setIsAutoGenerationPaused(true); 
    setCurrentGenerationStatus('Paused');
  };

  const stopAutoGenerating = () => {
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


  const getCurrencyIcon = (currencySymbol: string) => {
    switch (currencySymbol?.toUpperCase()) {
      case 'ETH': return 'Ξ';
      default: return currencySymbol?.charAt(0)?.toUpperCase() || '?';
    }
  };

  const maskValue = (value: string, start = 5, end = 5) => {
    if (!value || value.length < start + end + 3) return value;
    return `${value.substring(0, start)}...${value.substring(value.length - end)}`;
  };

  const handleCopyText = async (textToCopy: string, type: string) => {
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

  const getDataSourceTag = (dataSource: AddressBalanceResult['dataSource']) => {
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
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300">{dataSource || 'Unknown'}</span>;
    }
  };

  const getFetchButtonTextSuffix = () => {
    const keys = [];
    if (etherscanApiKeyInput.trim()) keys.push('Etherscan');
    if (blockcypherApiKeyInput.trim()) keys.push('BlockCypher');
    if (alchemyApiKeyInput.trim()) keys.push('Alchemy');
    
    if (keys.length === 0) return 'Simulate All';
    if (keys.length === 1) return `Use ${keys[0]} API`;
    if (keys.length === 2) return `Use ${keys.join(' & ')} APIs`;
    return 'Use All API Keys';
  }
  

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-2">
          <Wallet className="h-8 w-8" /> Balance Auditor
        </h1>
        <p className="text-muted-foreground">
          Enter seed phrases and API keys (Etherscan/BlockCypher/Alchemy) to derive addresses and fetch their real balances. Or, use the automatic generator.
        </p>
      </header>

      <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/50 text-destructive dark:text-destructive [&>svg]:text-destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Critical Security Warning & Usage Notice</AlertTitle>
        <AlertDescription>
          <strong>NEVER enter REAL seed phrases into ANY online tool you do not fully trust.</strong>
          This application is for demonstration and educational purposes.
          <ul>
            <li>It uses <code>ethers.js</code> for LOCAL address derivation. Your seed phrases are NOT sent to any server for derivation.</li>
            <li>It WILL attempt to use provided API keys (Etherscan, BlockCypher, Alchemy) to fetch REAL balances.</li>
            <li>If API keys are missing, invalid, or calls fail, it falls back to RANDOMLY SIMULATED balances (for manual input).</li>
            <li>The automatic generator attempts to find wallets with balances using the provided keys. If API calls fail (e.g. rate limits), results may show 0 balance with 'Unknown' source.</li>
            <li><strong>Exposing real seed phrases can lead to PERMANENT LOSS OF FUNDS. The pre-filled API keys are for demonstration and may be rate-limited or revoked.</strong></li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card className="shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Input Seed Phrases & API Keys</CardTitle>
          <CardDescription>
            Provide seed phrases (one per line) and your Etherscan/BlockCypher/Alchemy API keys for manual checking.
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
                For ETH balances. Pre-filled key is for demo.
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
                Alternative for ETH balances. Pre-filled key is for demo.
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
                Alternative for ETH balances. Pre-filled key is for demo.
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
            {isProcessingManual && !isAutoGenerating && currentGenerationStatus !== 'Running' && currentGenerationStatus !== 'Paused' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Balances...
              </>
            ) : (
              <>
                <SearchCheck className="mr-2 h-4 w-4" />
                Fetch Balances ({getFetchButtonTextSuffix()})
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
            Manually generate a specific number of random seed phrases (varying lengths: 12, 15, 18, 21, 24 words) and check their balances using the API keys above.
          </CardDescription>
        </CardHeader>
        <CardContent>
             <Input
              type="number"
              min="1"
              max="1000" // Reasonable upper limit for manual generation
              placeholder="Number of Seed Phrases"
              value={numSeedPhrasesToGenerate.toString()}
              onChange={(e) => setNumSeedPhrasesToGenerate(Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 1)))}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono w-full md:w-1/3"
              disabled={isProcessingManual || isAutoGenerating}
              aria-label="Number of Seed Phrases to Generate Input"
            />
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            onClick={handleManualGenerateAndCheck}
            disabled={isProcessingManual || isAutoGenerating}
            className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground"
            aria-label="Manual Generate and Check Seed Phrases Button"
          >
            {isProcessingManual && !isAutoGenerating && currentGenerationStatus !== 'Running' && currentGenerationStatus !== 'Paused' ? (
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
            Continuously generates random seed phrases (varying lengths) and checks for balances using the API keys above.
            Batch size for generation is set in the "Manual Seed Phrase Generation" section.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">SEED PHRASES PROCESSED</p>
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
                disabled={isProcessingManual || (isAutoGenerating && !isAutoGenerationPaused)}
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
            <CardTitle>Balance Results (Wallets with Balance &gt; 0)</CardTitle>
            <CardDescription>
              Etherscan API (masked): {etherscanApiKeyInput.trim() ? maskValue(etherscanApiKeyInput, 4, 4) : 'N/A'}.
              BlockCypher API (masked): {blockcypherApiKeyInput.trim() ? maskValue(blockcypherApiKeyInput, 4, 4) : 'N/A'}.
              Alchemy API (masked): {alchemyApiKeyInput.trim() ? maskValue(alchemyApiKeyInput, 4, 4) : 'N/A'}.
              Displaying last {MAX_DISPLAYED_RESULTS} results (newest first).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Derived addresses and their balances. Only wallets with balances &gt; 0 are shown.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Seed Phrase (Masked)</TableHead>
                  <TableHead className="w-[10%] text-center">Length</TableHead>
                  <TableHead className="w-[25%]">Derived Address (Masked)</TableHead>
                  <TableHead className="w-[15%] text-center">Wallet Type</TableHead>
                  <TableHead className="w-[10%] text-center">Crypto</TableHead>
                  <TableHead className="w-[10%] text-right">Balance</TableHead>
                  <TableHead className="w-[10%] text-center">Data Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={`${result.seedPhrase}-${index}-${result.derivedAddress}`} className={`hover:bg-secondary/50 ${result.derivationError ? 'bg-red-50 dark:bg-red-900/30' : ''}`}>
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
                          <a href={`https://etherscan.io/address/${result.derivedAddress}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
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
                      {result.cryptoName ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Coins className="h-3 w-3 text-muted-foreground" />
                          {result.cryptoName}
                        </span>
                      ) : result.isLoading ? '' : '-'}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {result.isLoading && !result.balanceData && <span className="text-muted-foreground text-xs">Loading...</span>}
                      {result.balanceData ? (
                        <span className="flex items-center justify-end gap-1 font-medium text-xs">
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${result.balanceData.isRealData ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-accent/20 text-accent'} text-[10px] font-bold shrink-0`}>
                            {getCurrencyIcon(result.balanceData.currency)}
                          </span>
                          {result.balanceData.balance.toFixed(6)}{' '}
                          <span className="text-muted-foreground text-[10px] shrink-0">{result.balanceData.currency}</span>
                        </span>
                      ) : result.error && !result.derivationError ? (
                        <span className="text-destructive text-xs italic">Fetch Error</span>
                      ) : (
                        !result.isLoading && '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top text-xs">
                      {result.isLoading && !result.balanceData && <Loader2 className="h-4 w-4 animate-spin text-accent inline-block" />}
                      {result.balanceData ? (
                        getDataSourceTag(result.balanceData.dataSource)
                      ) : result.derivationError ? (
                        '-'
                      ) : result.error && !result.isLoading ? (
                         getDataSourceTag('Simulated Fallback') 
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
