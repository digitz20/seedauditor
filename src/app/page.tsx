// @ts-nocheck
'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Import Input
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
import { Terminal, Loader2, Wallet, Network, Coins, Copy, Eraser, Trash2, KeyRound, Info, Eye, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeSeedPhraseAndSimulateBalance, getRealWalletData, simulateFetchAddressBalance, type SeedPhraseAuditResult, type RealWalletDataResult, type SimulatedAddressBalanceResult } from './actions';
import { Separator } from '@/components/ui/separator';


interface ResultRow {
  seedPhrase: string;
  auditData: Omit<SeedPhraseAuditResult, 'seedPhrase'> | null; // Omit seedPhrase as it's already in ResultRow
  error: string | null;
  isLoading: boolean;
}

interface AddressBalanceRow {
  address: string;
  balanceData: SimulatedAddressBalanceResult | null;
  error: string | null;
  isLoading: boolean;
}


export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>('');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [realDataResult, setRealDataResult] = useState<RealWalletDataResult | null>(null);
  const [isFetchingRealData, setIsFetchingRealData] = useState<boolean>(false);

  const [addressBalances, setAddressBalances] = useState<AddressBalanceRow[]>([]);
  const [isFetchingAddressBalances, setIsFetchingAddressBalances] = useState<boolean>(false);


  const { toast } = useToast();

  const handleAudit = async () => {
    const phrases = seedPhrasesInput
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (phrases.length === 0) {
      toast({
        title: 'No Seed Phrases Entered',
        description: 'Please enter at least one seed phrase for standard audit.',
        variant: 'destructive',
      });
      return;
    }
    if (phrases.length > 50) {
      toast({
        title: 'Too Many Seed Phrases',
        description: 'Please enter no more than 50 seed phrases at a time for this simulation.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setResults(
      phrases.map((phrase) => ({
        seedPhrase: phrase,
        auditData: null,
        error: null,
        isLoading: true,
      }))
    );
    setAddressBalances([]); // Clear previous address balances when starting a new audit

    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      try {
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        const { seedPhrase: originalPhrase, ...auditData } = await analyzeSeedPhraseAndSimulateBalance(phrase);
        setResults((prevResults) =>
          prevResults.map((r) =>
            r.seedPhrase === originalPhrase && r.isLoading // Ensure we update the correct loading row
              ? { ...r, auditData, isLoading: false }
              : r
          )
        );
      } catch (error: any) {
        setResults((prevResults) =>
          prevResults.map((r) =>
            r.seedPhrase === phrase && r.isLoading
              ? {
                  ...r,
                  error: error.message || 'An unknown simulation error occurred',
                  isLoading: false,
                }
              : r
          )
        );
        toast({
          title: 'Standard Simulation Error',
          description: `Failed for phrase starting with "${phrase.substring(0,10)}...": ${error.message}`,
          variant: 'destructive',
        });
      }
    }
    setIsProcessing(false);
    toast({
      title: 'Standard Simulation Complete',
      description: `Finished processing ${phrases.length} seed phrases.`,
    });
  };

  const handleFetchRealData = async () => {
    const firstPhrase = seedPhrasesInput.split('\n').map(p => p.trim()).find(p => p.length > 0);

    if (!firstPhrase) {
      toast({
        title: 'No Seed Phrase Entered',
        description: 'Please enter at least one seed phrase to simulate real data fetching.',
        variant: 'destructive',
      });
      return;
    }
    if (!apiKeyInput) {
       toast({
        title: 'API Key Missing',
        description: 'Please enter a conceptual API key to simulate real data fetching.',
        variant: 'destructive',
      });
      return;
    }

    setIsFetchingRealData(true);
    setRealDataResult(null); // Clear previous results

    try {
      const result = await getRealWalletData(apiKeyInput, firstPhrase);
      setRealDataResult(result);
      toast({
        title: 'Conceptual Real Data Simulation Complete',
        description: result.message,
      });
    } catch (error: any) {
      setRealDataResult({
        seedPhrase: firstPhrase,
        derivedAddress: 'Error',
        walletType: 'Error',
        cryptoName: 'Error',
        simulatedBalances: [],
        message: `Simulation Error: ${error.message}`,
      });
      toast({
        title: 'Conceptual Real Data Simulation Error',
        description: error.message,
        variant: 'destructive',
      });
    }
    setIsFetchingRealData(false);
  };

  const handleFetchAllAddressBalances = async () => {
    const derivedAddresses = results
      .filter(r => r.auditData && r.auditData.derivedAddress && r.auditData.derivedAddress !== 'Error')
      .map(r => r.auditData!.derivedAddress);

    if (derivedAddresses.length === 0) {
      toast({
        title: 'No Derived Addresses',
        description: 'Please run a standard audit first to derive addresses.',
        variant: 'default',
      });
      return;
    }

    setIsFetchingAddressBalances(true);
    setAddressBalances(
      derivedAddresses.map(address => ({
        address,
        balanceData: null,
        error: null,
        isLoading: true,
      }))
    );

    for (const address of derivedAddresses) {
      try {
        // Use apiKeyInput if provided, otherwise pass undefined
        const balanceData = await simulateFetchAddressBalance(address, apiKeyInput || undefined);
        setAddressBalances(prevBalances =>
          prevBalances.map(b =>
            b.address === address && b.isLoading
              ? { ...b, balanceData, isLoading: false }
              : b
          )
        );
      } catch (error: any) {
        setAddressBalances(prevBalances =>
          prevBalances.map(b =>
            b.address === address && b.isLoading
              ? { ...b, error: error.message || 'Unknown error', isLoading: false }
              : b
          )
        );
        toast({
          title: `Balance Fetch Error for ${maskValue(address, 6, 4)}`,
          description: error.message,
          variant: 'destructive',
        });
      }
    }
    setIsFetchingAddressBalances(false);
    toast({
      title: 'Address Balance Simulation Complete',
      description: `Finished fetching simulated balances for ${derivedAddresses.length} addresses.`,
    });
  };


  const handleClearInput = () => {
    setSeedPhrasesInput('');
    setApiKeyInput(''); // Also clear API key input
    toast({
      title: 'Input Cleared',
      description: 'The seed phrase and API key input areas have been cleared.',
    });
  };

  const handleClearResults = () => {
    setResults([]);
    setRealDataResult(null); // Also clear real data results
    setAddressBalances([]); // Clear address balances as well
    toast({
      title: 'Results Cleared',
      description: 'All audit and balance results have been cleared.',
    });
  };

  const getCurrencyIcon = (currencySymbol: string) => {
    switch (currencySymbol?.toUpperCase()) {
      case 'ETH': return 'Ξ';
      case 'BTC': return '₿';
      case 'SOL': return 'S';
      case 'MATIC': return 'M';
      case 'USDT': return '₮';
      case 'USDC': return 'C';
      case 'DAI': return 'D';
      case 'WBTC': return 'B'; // For Wrapped Bitcoin
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

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-2">
          <Wallet className="h-8 w-8" /> Seed Phrase Auditor & Simulator
        </h1>
        <p className="text-muted-foreground">
          Enter seed phrases to simulate address derivation and balance retrieval.
          Optionally, provide a conceptual API key to simulate fetching "real" data.
        </p>
      </header>

      <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/50 text-destructive dark:text-destructive [&>svg]:text-destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Critical Security Warning & Simulation Notice</AlertTitle>
        <AlertDescription>
          <strong>NEVER enter REAL seed phrases or REAL API keys into ANY online tool, especially this one.</strong>
          This application is for educational and demonstration purposes ONLY.
          <ul>
            <li>It uses <code>ethers.js</code> for LOCAL, SIMULATED address derivation.</li>
            <li>It <strong>DOES NOT</strong> connect to real wallets or blockchains for standard audit.</li>
            <li>Balances for standard audit are RANDOMLY GENERATED.</li>
            <li>The "Fetch Real Data (Simulated)" feature is also a SIMULATION. It mimics how an API key might be used but <strong>DOES NOT</strong> make actual external API calls with your key. Data is still randomly generated.</li>
            <li>The "Fetch Address Balances (Simulated)" feature also uses RANDOMLY GENERATED data and does not query any real blockchain.</li>
            <li><strong>Exposing real seed phrases or API keys can lead to PERMANENT LOSS OF FUNDS.</strong></li>
          </ul>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Standard Simulation Input</CardTitle>
            <CardDescription>For local address derivation and random balance simulation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste your seed phrases here, one per line (e.g., standard 12 or 24 words)..."
              value={seedPhrasesInput}
              onChange={(e) => setSeedPhrasesInput(e.target.value)}
              rows={6}
              className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
              disabled={isProcessing || isFetchingRealData || isFetchingAddressBalances}
              aria-label="Seed Phrases Input for Standard Simulation"
            />
             <Button
                onClick={handleAudit}
                disabled={isProcessing || isFetchingRealData || isFetchingAddressBalances || !seedPhrasesInput.trim()}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                aria-label="Audit Phrases Button"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing Standard Audit...
                  </>
                ) : (
                  'Run Standard Audit (Simulate)'
                )}
              </Button>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Conceptual "Real" Data Fetch (Simulated)</CardTitle>
            <CardDescription>
              Uses the <strong>first seed phrase</strong> from the left input and a conceptual API key below.
              This is still a SIMULATION and does not use a real API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <Input
                type="password" // Mask API key input
                placeholder="Enter conceptual API Key here (SIMULATION ONLY)"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
                disabled={isProcessing || isFetchingRealData || isFetchingAddressBalances}
                aria-label="Conceptual API Key Input"
              />
            <Button
              onClick={handleFetchRealData}
              disabled={isProcessing || isFetchingRealData || isFetchingAddressBalances || !seedPhrasesInput.trim() || !apiKeyInput.trim()}
              variant="secondary"
              className="w-full"
              aria-label="Fetch Real Data Simulated Button"
            >
              {isFetchingRealData ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Simulating Real Data Fetch...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Fetch "Real" Data (Simulated)
                </>
              )}
            </Button>
          </CardContent>
           <CardFooter>
             <Alert variant="default" className="text-xs mt-2 bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700/50 dark:text-blue-300 [&>svg]:text-blue-700 dark:[&>svg]:text-blue-300">
                <Info className="h-4 w-4"/>
                <AlertTitle className="font-semibold">How this "Real Data" Simulation Works</AlertTitle>
                <AlertDescription>
                    This tool will take the <strong>first seed phrase</strong> you entered on the left and your <strong>conceptual API key</strong>. It will then simulate deriving an address and fetching various (randomly generated) token balances, as if it were using a real blockchain data API. <strong>No actual API calls are made, and your key is not sent anywhere.</strong>
                </AlertDescription>
            </Alert>
           </CardFooter>
        </Card>
      </div>
      
      <div className="mb-6 flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleClearInput}
            disabled={isProcessing || isFetchingRealData || isFetchingAddressBalances || (seedPhrasesInput.length === 0 && apiKeyInput.length === 0)}
            variant="outline"
            className="w-full sm:w-auto"
            aria-label="Clear All Inputs Button"
          >
            <Eraser className="mr-2 h-4 w-4" />
            Clear All Inputs
          </Button>
          <Button
            onClick={handleClearResults}
            disabled={isProcessing || isFetchingRealData || isFetchingAddressBalances || (results.length === 0 && !realDataResult && addressBalances.length === 0)}
            variant="outline"
            className="w-full sm:w-auto"
            aria-label="Clear All Results Button"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All Results
          </Button>
          <Button
              onClick={handleFetchAllAddressBalances}
              disabled={isProcessing || isFetchingRealData || isFetchingAddressBalances || results.filter(r => r.auditData && r.auditData.derivedAddress && r.auditData.derivedAddress !== 'Error').length === 0}
              variant="outline"
              className="w-full sm:w-auto border-accent text-accent hover:bg-accent/10 hover:text-accent"
              aria-label="Fetch Address Balances Button"
            >
              {isFetchingAddressBalances ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching Balances...
                </>
              ) : (
                <>
                  <Server className="mr-2 h-4 w-4" />
                  Fetch Address Balances (Simulated)
                </>
              )}
            </Button>
      </div>


      {results.length > 0 && (
        <Card className="shadow-md mb-6">
          <CardHeader>
            <CardTitle>Standard Audit Results (Simulated)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Simulated derivation and randomly generated balance results for multiple phrases.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Seed Phrase (Masked)</TableHead>
                  <TableHead className="w-[30%]">Derived Address (Masked)</TableHead>
                  <TableHead className="w-[20%] text-center">Wallet Type</TableHead>
                  <TableHead className="w-[10%] text-center">Primary Crypto</TableHead>
                  <TableHead className="w-[15%] text-right">Simulated Balance</TableHead>
                  <TableHead className="w-[5%] text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={`${result.seedPhrase}-${index}`} className="hover:bg-secondary/50">
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
                    </TableCell>
                    <TableCell className="font-mono text-xs align-top">
                      {result.auditData ? (
                        <div className="flex items-center gap-1">
                          <span>{maskValue(result.auditData.derivedAddress, 6, 4)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => handleCopyText(result.auditData!.derivedAddress, 'Derived Address')}
                            aria-label="Copy derived address"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : result.error ? (
                        '-'
                      ) : (
                        'Deriving...'
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top text-xs">
                      {result.auditData ? (
                        <span className="inline-flex items-center gap-1">
                          <Network className="h-3 w-3 text-muted-foreground" />
                          {result.auditData.walletType}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center align-top">
                       {result.auditData ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Coins className="h-3 w-3 text-muted-foreground" />
                          {result.auditData.cryptoName}
                        </span>
                       ) : '-'}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {result.auditData ? (
                        <span className="flex items-center justify-end gap-1 font-medium text-xs">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold shrink-0">
                            {getCurrencyIcon(result.auditData.simulatedCurrency)}
                          </span>
                          {result.auditData.simulatedBalance.toFixed(4)}{' '}
                          <span className="text-muted-foreground text-[10px] shrink-0">{result.auditData.simulatedCurrency}</span>
                        </span>
                      ) : result.error ? (
                        <span className="text-destructive text-xs italic">Error</span>
                      ) : result.isLoading ? (
                        <span className="text-muted-foreground text-xs">Loading...</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      {result.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-accent inline-block" />
                      ) : result.error ? (
                        <span className="text-destructive text-xs font-semibold">Failed</span>
                      ) : (
                        <span className="text-green-600 text-xs font-semibold">Success</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {addressBalances.length > 0 && (
        <Card className="shadow-md mb-6">
          <CardHeader>
            <CardTitle>Simulated Address Balances</CardTitle>
            <CardDescription>
              {apiKeyInput ? `Conceptual API Key (masked): ${maskValue(apiKeyInput,4,4)} may have been conceptually used for this simulation.` : 'No API key was provided for this simulation.'}
              <br/>
              These are RANDOMLY GENERATED balances for derived addresses. No real blockchain was queried.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Simulated balance results for derived Ethereum addresses.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60%]">Address (Masked)</TableHead>
                  <TableHead className="w-[30%] text-right">Simulated Balance (ETH)</TableHead>
                  <TableHead className="w-[10%] text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addressBalances.map((item, index) => (
                  <TableRow key={`${item.address}-${index}`} className="hover:bg-secondary/50">
                    <TableCell className="font-mono text-xs align-top">
                      <div className="flex items-center gap-1">
                        <span>{maskValue(item.address, 8, 6)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
                          onClick={() => handleCopyText(item.address, 'Address')}
                          aria-label="Copy address"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {item.balanceData ? (
                         <span className="flex items-center justify-end gap-1 font-medium text-xs">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold shrink-0">
                            {getCurrencyIcon(item.balanceData.currency)}
                          </span>
                          {item.balanceData.balance.toFixed(4)}{' '}
                          <span className="text-muted-foreground text-[10px] shrink-0">{item.balanceData.currency}</span>
                        </span>
                      ) : item.error ? (
                        <span className="text-destructive text-xs italic">Error</span>
                      ) : (
                         <span className="text-muted-foreground text-xs">Loading...</span>
                      )}
                    </TableCell>
                     <TableCell className="text-center align-top">
                      {item.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-accent inline-block" />
                      ) : item.error ? (
                        <span className="text-destructive text-xs font-semibold">Failed</span>
                      ) : (
                        <span className="text-green-600 text-xs font-semibold">Success</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}


      {realDataResult && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Conceptual "Real" Data Fetch Result (Simulated)</CardTitle>
            <CardDescription>
              This data is SIMULATED. No actual API call was made using your key.
              Showing results for seed phrase: {maskValue(realDataResult.seedPhrase, 6, 4)}
              {realDataResult.apiKeyUsed && ` (Conceptual API Key: ${realDataResult.apiKeyUsed})`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-4 p-4 border rounded-md bg-secondary/30">
                <p className="text-sm"><strong>Original Seed Phrase (Masked):</strong> <span className="font-mono">{maskValue(realDataResult.seedPhrase, 6,4)}</span></p>
                <p className="text-sm"><strong>Derived Address (Masked):</strong> 
                    <span className="font-mono flex items-center gap-1">
                        {maskValue(realDataResult.derivedAddress, 8,6)}
                        {realDataResult.derivedAddress !== "Error" && 
                            <Button variant="ghost" size="icon" className="h-5 w-5 p-0" onClick={() => handleCopyText(realDataResult.derivedAddress, "Address")}><Copy className="h-3 w-3"/></Button>
                        }
                    </span>
                </p>
                <p className="text-sm"><strong>Wallet Type:</strong> {realDataResult.walletType}</p>
                <p className="text-sm"><strong>Primary Crypto:</strong> {realDataResult.cryptoName}</p>
                <p className="text-sm text-muted-foreground italic">{realDataResult.message}</p>
            </div>

            {realDataResult.simulatedBalances && realDataResult.simulatedBalances.length > 0 && (
              <>
                <h4 className="text-md font-semibold mb-2">Simulated Asset Balances:</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Simulated Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {realDataResult.simulatedBalances.map((balance, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-xs">
                           <span className="flex items-center gap-1.5">
                             <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-sm font-bold shrink-0">
                               {getCurrencyIcon(balance.asset)}
                             </span>
                             {balance.asset}
                           </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {balance.amount.toFixed(balance.asset === 'ETH' || balance.asset === 'WBTC' ? 6 : 2)}{' '}
                           <span className="text-muted-foreground">{balance.currency}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
             {realDataResult.derivedAddress === "Error" && (
                <Alert variant="destructive">
                    <Terminal className="h-4 w-4" />
                    <AlertTitle>Simulation Failed</AlertTitle>
                    <AlertDescription>
                        Could not complete the conceptual "real" data fetch simulation. Check the error message above.
                    </AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
