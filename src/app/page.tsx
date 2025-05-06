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
import { Terminal, Loader2, Wallet, Network, Coins, Copy, Eraser, Trash2, KeyRound, Info, ExternalLink, SearchCheck, ShieldAlert, DatabaseZap, Pause, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { processSeedPhrasesAndFetchBalances, type ProcessedWalletInfo, type AddressBalanceResult } from './actions';
import { generateAndCheckSeedPhrases, type GenerateAndCheckSeedPhrasesOutput } from '@/ai/flows/random-seed-phrase';


interface ResultRow extends ProcessedWalletInfo {
  isLoading: boolean;
}


export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>('');
  const [etherscanApiKeyInput, setEtherscanApiKeyInput] = useState<string>('ZKPID4755Q9BJZVXXZ96M3N6RSXYE7NTRV'); // Default Etherscan API Key
  const [blockcypherApiKeyInput, setBlockcypherApiKeyInput] = useState<string>('41ccb7c601ef4bad99b3698cfcea9a8c'); // Default BlockCypher API Key
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [numSeedPhrasesToGenerate, setNumSeedPhrasesToGenerate] = useState<number>(1); // Default number of seed phrases to generate

  const { toast } = useToast();

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

    if (!hasEtherscanKey && !hasBlockcypherKey) {
      toast({
        title: 'API Key Recommended',
        description: 'Please enter an Etherscan or BlockCypher API key for real ETH balances. Balances will be simulated.',
        variant: 'default',
      });
    } else if (!hasEtherscanKey) {
      toast({
        title: 'Etherscan API Key Missing',
        description: 'Etherscan API key is missing. Will attempt to use BlockCypher or simulate.',
        variant: 'default',
      });
    } else if (!hasBlockcypherKey) {
      toast({
        title: 'BlockCypher API Key Missing',
        description: 'BlockCypher API key is missing. Will attempt to use Etherscan or simulate.',
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

    setIsProcessing(true);
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
      }))
    );

    try {
      const processedData = await processSeedPhrasesAndFetchBalances(
        phrases,
        etherscanApiKeyInput || undefined,
        blockcypherApiKeyInput || undefined
      );

      setResults(processedData.map(data => ({ ...data, isLoading: false })));

      let toastMessage = `Finished processing ${phrases.length} seed phrases. `;
      if (hasEtherscanKey && hasBlockcypherKey) {
        toastMessage += 'Attempted to fetch real ETH balances using Etherscan and BlockCypher.';
      } else if (hasEtherscanKey) {
        toastMessage += 'Attempted to fetch real ETH balances using Etherscan.';
      } else if (hasBlockcypherKey) {
        toastMessage += 'Attempted to fetch real ETH balances using BlockCypher.';
      } else {
        toastMessage += 'API keys not provided; ETH balances are simulated.';
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

    setIsProcessing(false);
  };


  const handleGenerateAndCheckSeedPhrases = async () => {
    setIsProcessing(true);
    setResults([]); // Clear previous results

    try {
      const input = {
        numSeedPhrases: numSeedPhrasesToGenerate,
        etherscanApiKey: etherscanApiKeyInput || '',
        blockcypherApiKey: blockcypherApiKeyInput || '',
      };

      const generatedData: GenerateAndCheckSeedPhrasesOutput = await generateAndCheckSeedPhrases(input);

      // Convert the GenerateAndCheckSeedPhrasesOutput to the ResultRow format
      const processedData = generatedData.map(item => ({
        seedPhrase: item.seedPhrase,
        derivedAddress: item.derivedAddress,
        walletType: item.walletType,
        cryptoName: item.cryptoName,
        balanceData: {
          address: item.derivedAddress,
          balance: item.balance,
          currency: item.cryptoName,
          isRealData: true, // Assuming the balance data is always real in this case
          dataSource: item.dataSource,
        },
        error: null,
        derivationError: null,
        isLoading: false,
      }));

      setResults(processedData);

      toast({
        title: 'Seed Phrases Generated and Checked',
        description: `Generated and checked ${numSeedPhrasesToGenerate} seed phrases.`,
      });
    } catch (error: any) {
      console.error("Error generating and checking seed phrases:", error);
      toast({
        title: 'Generation and Check Error',
        description: `An error occurred: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
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
      case 'Simulated Fallback':
      default:
        return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-800/30 dark:text-amber-300">Simulated</span>;
    }
  };

  const getFetchButtonText = () => {
    const hasEtherscan = etherscanApiKeyInput.trim();
    const hasBlockcypher = blockcypherApiKeyInput.trim();
    if (hasEtherscan && hasBlockcypher) return 'Use API Keys';
    if (hasEtherscan) return 'Use Etherscan API';
    if (hasBlockcypher) return 'Use BlockCypher API';
    return 'Simulate All';
  }

  // Automatic Seed Phrase Generation Logic
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPaused, setGenerationPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null); // Store the interval ID

  const startGenerating = () => {
    setIsGenerating(true);
    setGenerationPaused(false); // Ensure it's not paused when starting
  
    intervalRef.current = setInterval(async () => {
      if (!generationPaused) {
        try {
          const input = {
            numSeedPhrases: numSeedPhrasesToGenerate,
            etherscanApiKey: etherscanApiKeyInput || '',
            blockcypherApiKey: blockcypherApiKeyInput || '',
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
              isRealData: true,
              dataSource: item.dataSource,
            },
            error: null,
            derivationError: null,
            isLoading: false,
          }));
  
          // Update the results state by appending new results
          setResults(prevResults => [...prevResults, ...processedData]);
  
        } catch (error: any) {
          console.error("Error generating and checking seed phrases:", error);
          toast({
            title: 'Generation and Check Error',
            description: `An error occurred: ${error.message}`,
            variant: 'destructive',
          });
          stopGenerating();
        }
      }
    }, 2000); // Adjust interval as needed
  };

  // Function to pause the seed phrase generation
  const pauseGenerating = () => {
    setGenerationPaused(true);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };

  // Function to stop the seed phrase generation
  const stopGenerating = () => {
    setIsGenerating(false);
    setGenerationPaused(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null; // Clear the interval ID after stopping
    }
  };
  
  useEffect(() => {
    // Cleanup function in useEffect to clear the interval when the component unmounts
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-2">
          <Wallet className="h-8 w-8" /> ETH Balance Auditor
        </h1>
        <p className="text-muted-foreground">
          Enter seed phrases and API keys (Etherscan/BlockCypher) to derive addresses and fetch their real ETH balances.
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
            <li>It WILL attempt to use provided API keys (Etherscan, BlockCypher) to fetch REAL ETH balances.</li>
            <li>If API keys are missing, invalid, or calls fail, it falls back to RANDOMLY SIMULATED ETH balances.</li>
            <li><strong>Exposing real seed phrases can lead to PERMANENT LOSS OF FUNDS. The pre-filled API keys are for demonstration and may be rate-limited or revoked.</strong></li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card className="shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Input Seed Phrases & API Keys</CardTitle>
          <CardDescription>
            Provide seed phrases (one per line) and your Etherscan/BlockCypher API keys.
            Real ETH balances will be fetched if keys are valid; otherwise, simulated balances are shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-3">
            <Textarea
              placeholder="Paste your seed phrases here, one per line...
SIMULATION ONLY - DO NOT USE REAL SEED PHRASES UNLESS YOU ARE CERTAIN OF THE ENVIRONMENT'S SECURITY"
              value={seedPhrasesInput}
              onChange={(e) => setSeedPhrasesInput(e.target.value)}
              rows={8}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessing}
              aria-label="Seed Phrases Input"
            />
             <div className="flex items-center space-x-2">
              <Button
                onClick={handleClearInput}
                disabled={isProcessing || seedPhrasesInput.length === 0}
                variant="outline"
                className="w-1/2 sm:w-auto"
                aria-label="Clear Seed Phrases Input Button"
              >
                <Eraser className="mr-2 h-4 w-4" />
                Clear Input
              </Button>
            </div>
          </div>
          <div className="md:col-span-1 space-y-3">
            <Input
              type="password"
              placeholder="Enter Etherscan API Key"
              value={etherscanApiKeyInput}
              onChange={(e) => setEtherscanApiKeyInput(e.target.value)}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessing}
              aria-label="Etherscan API Key Input"
            />
            <Alert variant="default" className="text-xs mt-2 bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700/50 dark:text-blue-300 [&>svg]:text-blue-700 dark:[&>svg]:text-blue-300">
              <DatabaseZap className="h-4 w-4" />
              <AlertTitle className="font-semibold">Etherscan API</AlertTitle>
              <AlertDescription>
                Used to fetch actual ETH balances. If invalid/missing, will try BlockCypher or simulate. Pre-filled key is for demo.
              </AlertDescription>
            </Alert>
          </div>
          <div className="md:col-span-1 space-y-3">
            <Input
              type="password"
              placeholder="Enter BlockCypher API Key"
              value={blockcypherApiKeyInput}
              onChange={(e) => setBlockcypherApiKeyInput(e.target.value)}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessing}
              aria-label="BlockCypher API Key Input"
            />
            <Alert variant="default" className="text-xs mt-2 bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700/50 dark:text-purple-300 [&>svg]:text-purple-700 dark:[&>svg]:text-purple-300">
              <DatabaseZap className="h-4 w-4" />
              <AlertTitle className="font-semibold">BlockCypher API</AlertTitle>
              <AlertDescription>
                Alternative for fetching ETH balances. If invalid/missing, will try Etherscan or simulate. Pre-filled key is for demo.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            onClick={handleFetchBalances}
            disabled={isProcessing || !seedPhrasesInput.trim()}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
            aria-label="Fetch ETH Balances Button"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Balances...
              </>
            ) : (
              <>
                <SearchCheck className="mr-2 h-4 w-4" />
                Fetch ETH Balances ({getFetchButtonText()})
              </>
            )}
          </Button>
          <Button
            onClick={handleClearResults}
            disabled={isProcessing || results.length === 0}
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
          <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" /> Generate & Check Seed Phrases</CardTitle>
          <CardDescription>
            Generate random seed phrases and check their ETH balances using the provided API keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Input
              type="number"
              placeholder="Number of Seed Phrases to Generate"
              value={numSeedPhrasesToGenerate.toString()}
              onChange={(e) => setNumSeedPhrasesToGenerate(parseInt(e.target.value, 10))}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessing}
              aria-label="Number of Seed Phrases to Generate Input"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            onClick={handleGenerateAndCheckSeedPhrases}
            disabled={isProcessing}
            className="w-full sm:w-auto bg-green-500 hover:bg-green-700 text-primary-foreground"
            aria-label="Generate and Check Seed Phrases Button"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating & Checking...
              </>
            ) : (
              <>
                <SearchCheck className="mr-2 h-4 w-4" />
                Generate & Check
              </>
            )}
          </Button>
          <div className="flex items-center space-x-2">
            {!isGenerating ? (
              <Button
                onClick={startGenerating}
                disabled={isProcessing}
                className="w-1/3 sm:w-auto"
                aria-label="Start Generating"
              >
                <Play className="mr-2 h-4 w-4" />
                Start
              </Button>
            ) : generationPaused ? (
              <Button
                onClick={startGenerating}
                disabled={isProcessing}
                className="w-1/3 sm:w-auto"
                aria-label="Resume Generating"
              >
                <Play className="mr-2 h-4 w-4" />
                Resume
              </Button>
            ) : (
              <Button
                onClick={pauseGenerating}
                disabled={isProcessing}
                variant="secondary"
                className="w-1/3 sm:w-auto"
                aria-label="Pause Generating"
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            )}
            {isGenerating && (
              <Button
                onClick={stopGenerating}
                disabled={isProcessing}
                variant="outline"
                className="w-1/3 sm:w-auto"
                aria-label="Stop Generating"
              >
                <Pause className="mr-2 h-4 w-4" />
                Stop
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>


      {results.length > 0 && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>ETH Balance Results</CardTitle>
            <CardDescription>
              Etherscan API (masked): {etherscanApiKeyInput.trim() ? maskValue(etherscanApiKeyInput, 4, 4) : 'N/A'}.
              BlockCypher API (masked): {blockcypherApiKeyInput.trim() ? maskValue(blockcypherApiKeyInput, 4, 4) : 'N/A'}.
              {' Balances show data source (Etherscan, BlockCypher, or Simulated).'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Derived addresses and their ETH balances.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18%]">Seed Phrase (Masked)</TableHead>
                  <TableHead className="w-[27%]">Derived Address (Masked)</TableHead>
                  <TableHead className="w-[15%] text-center">Wallet Type</TableHead>
                  <TableHead className="w-[10%] text-center">Crypto</TableHead>
                  <TableHead className="w-[15%] text-right">Balance (ETH)</TableHead>
                  <TableHead className="w-[10%] text-center">Data Source</TableHead>
                  <TableHead className="w-[5%] text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={`${result.seedPhrase}-${index}`} className={`hover:bg-secondary/50 ${result.derivationError ? 'bg-red-50 dark:bg-red-900/30' : ''}`}>
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
                      {result.isLoading && !result.balanceData && ''}
                      {result.balanceData ? (
                        getDataSourceTag(result.balanceData.dataSource)
                      ) : result.derivationError ? (
                        '-'
                      ) : result.error ? (
                        getDataSourceTag('Simulated Fallback') // Show simulated if error but not derivation error
                      ) : (
                        !result.isLoading && '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      {result.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-accent inline-block" />
                      ) : result.error ? (
                        <span className="text-destructive text-xs font-semibold">Failed</span>
                      ) : (
                        <span className="text-green-600 text-xs font-semibold">Done</span>
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
