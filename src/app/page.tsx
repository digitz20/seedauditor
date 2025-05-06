// @ts-nocheck
'use client';

import * as React from 'react';
import { useState } from 'react';
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
import { Terminal, Loader2, Wallet, Network, Coins, Copy, Eraser, Trash2, KeyRound, Info, ExternalLink, SearchCheck, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { processSeedPhrasesAndFetchBalances, type ProcessedWalletInfo } from './actions';


interface ResultRow extends ProcessedWalletInfo {
  isLoading: boolean; // For individual row loading, though main processing is batched
}


export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('ZKPID4755Q9BJZVXXZ96M3N6RSXYE7NTRV'); // Default Etherscan API Key
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
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
     if (!apiKeyInput.trim()) {
      toast({
        title: 'Etherscan API Key Required',
        description: 'Please enter an Etherscan API key to fetch real ETH balances. If the key is invalid or missing, balances will be simulated as a fallback.',
        variant: 'destructive', // Changed to destructive as it's a primary requirement for "real" data
      });
      // Allow to proceed, will use simulation if key is bad or missing
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
    // Initialize results with loading state
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
      // Call the unified server action
      const processedData = await processSeedPhrasesAndFetchBalances(phrases, apiKeyInput || undefined);
      
      // Update results based on the processed data
      setResults(processedData.map(data => ({ ...data, isLoading: false })));

      toast({
        title: 'Balance Fetch Complete',
        description: `Finished processing ${phrases.length} seed phrases. ${apiKeyInput ? 'Attempted to fetch real ETH balances using Etherscan.' : 'Etherscan API key not provided; ETH balances are simulated.'}`,
      });

    } catch (error: any) {
      // This catch is for errors from the server action itself, not individual phrase errors
      console.error("General error during balance fetching process:", error);
      toast({
        title: 'Processing Error',
        description: `An unexpected error occurred: ${error.message}. Some results might be incomplete.`,
        variant: 'destructive',
      });
       // Mark all as not loading, errors are handled per-row from `processedData`
      setResults(prevResults => prevResults.map(r => ({...r, isLoading: false, error: r.error || "Overall process failed" })));
    }

    setIsProcessing(false);
  };

  const handleClearInput = () => {
    setSeedPhrasesInput('');
    // Keep API key or clear it? User preference. For now, clearing both.
    // setApiKeyInput(''); // Let's keep the API key if they want to reuse it
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
    if (!value || value.length < start + end + 3) return value; // Return original if too short to mask meaningfully
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

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-2">
          <Wallet className="h-8 w-8" /> ETH Balance Auditor
        </h1>
        <p className="text-muted-foreground">
          Enter seed phrases and an Etherscan API key to derive addresses and fetch their real ETH balances.
        </p>
      </header>

      <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/50 text-destructive dark:text-destructive [&>svg]:text-destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Critical Security Warning & Usage Notice</AlertTitle>
        <AlertDescription>
          <strong>NEVER enter REAL seed phrases into ANY online tool you do not fully trust.</strong>
          This application is for demonstration and educational purposes.
          <ul>
            <li>It uses <code>ethers.js</code> for LOCAL address derivation from seed phrases. Your seed phrases are NOT sent to any server for derivation.</li>
            <li>It WILL attempt to use the provided Etherscan API key to fetch REAL ETH balances for the derived addresses.</li>
            <li>If no Etherscan API key is provided, or if an Etherscan API call fails, it will fall back to RANDOMLY SIMULATED ETH balances for affected addresses and indicate this.</li>
            <li><strong>Exposing real seed phrases can lead to PERMANENT LOSS OF FUNDS. Only use the API key feature if you understand the risks and are using a key with appropriate permissions. The pre-filled Etherscan API key is for demonstration and may be rate-limited or revoked.</strong></li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card className="shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Input Seed Phrases & API Key</CardTitle>
          <CardDescription>
            Provide seed phrases (one per line) and your Etherscan API key. 
            Real ETH balances will be fetched if the key is valid; otherwise, simulated balances are shown as a fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
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
          </div>
          <div className="space-y-3">
            <Input
              type="password" 
              placeholder="Enter Etherscan API Key"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessing}
              aria-label="Etherscan API Key Input"
            />
             <Alert variant="default" className="text-xs mt-2 bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700/50 dark:text-blue-300 [&>svg]:text-blue-700 dark:[&>svg]:text-blue-300">
                <Info className="h-4 w-4"/>
                <AlertTitle className="font-semibold">API Key Usage</AlertTitle>
                <AlertDescription>
                    The Etherscan API key is used to fetch <strong>actual ETH balances</strong>. If this key is invalid, missing, or rate-limited, or if an individual address query fails, a <em>simulated</em> ETH balance will be shown for that address as a fallback.
                    The pre-filled key is for demonstration.
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
                  Fetch ETH Balances {apiKeyInput.trim() ? '(Use API Key)' : '(Simulate All)'}
                </>
              )}
            </Button>
            <Button
              onClick={handleClearInput}
              disabled={isProcessing || seedPhrasesInput.length === 0}
              variant="outline"
              className="w-full sm:w-auto"
              aria-label="Clear Seed Phrases Input Button"
            >
              <Eraser className="mr-2 h-4 w-4" />
              Clear Seed Phrases
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
      
      {results.length > 0 && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>ETH Balance Results</CardTitle>
            <CardDescription>
              {apiKeyInput.trim() ? `Attempted to use Etherscan API Key (masked): ${maskValue(apiKeyInput,4,4)}.` : 'No Etherscan API key provided; all ETH balances are simulated.'}
              {' Balances marked "Simulated Fallback" could not be fetched via API.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Derived addresses and their ETH balances (real or simulated).</TableCaption>
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
                          {result.balanceData.balance.toFixed(6)}{' '} {/* Increased precision for ETH */}
                          <span className="text-muted-foreground text-[10px] shrink-0">{result.balanceData.currency}</span>
                        </span>
                      ) : result.error && !result.derivationError ? ( // Show error only if not derivation error
                        <span className="text-destructive text-xs italic">Fetch Error</span>
                      ) : (
                        !result.isLoading && '-'
                      )}
                    </TableCell>
                     <TableCell className="text-center align-top text-xs">
                      {result.isLoading && !result.balanceData && ''}
                      {result.balanceData ? (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${result.balanceData.isRealData ? 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-800/30 dark:text-amber-300'}`}>
                          {result.balanceData.isRealData ? 'Etherscan API' : 'Simulated Fallback'}
                        </span>
                      ) : result.derivationError ? ( // If derivation failed, no source to show
                         '-'
                      ): result.error ? ( // If general error, but not derivation, show simulated
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-800/30 dark:text-amber-300">Simulated Fallback</span>
                      ): (
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
