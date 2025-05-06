'use client';

import * as React from 'react';
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
import { Terminal, Loader2, Wallet, Network, Coins } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeSeedPhraseAndSimulateBalance, type SeedPhraseAuditResult } from './actions';

interface ResultRow {
  seedPhrase: string;
  auditData: SeedPhraseAuditResult | null;
  error: string | null;
  isLoading: boolean;
}

export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>('');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { toast } = useToast();

  const handleAudit = async () => {
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
    if (phrases.length > 50) { // Reduced limit for demo purposes
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

    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      try {
        const auditResult = await analyzeSeedPhraseAndSimulateBalance(phrase);
        setResults((prevResults) =>
          prevResults.map((r, index) =>
            index === i
              ? { ...r, auditData: auditResult, isLoading: false }
              : r
          )
        );
      } catch (error: any) {
        setResults((prevResults) =>
          prevResults.map((r, index) =>
            index === i
              ? {
                  ...r,
                  error: error.message || 'An unknown simulation error occurred',
                  isLoading: false,
                }
              : r
          )
        );
        toast({
          title: 'Simulation Error',
          description: `Failed to process phrase: ${error.message}`,
          variant: 'destructive',
        });
      }
    }

    setIsProcessing(false);
    toast({
      title: 'Simulation Complete',
      description: `Finished processing ${phrases.length} seed phrases.`,
    });
  };

  // Simple icon mapping simulation
  const getCurrencyIcon = (currencySymbol: string) => {
    switch (currencySymbol.toUpperCase()) {
      case 'ETH': return 'Ξ';
      case 'BTC': return '₿'; // Though we're focusing on EVM, keep for diversity
      case 'SOL': return 'S';
      case 'MATIC': return 'M';
      case 'USDT': return '₮';
      case 'USDC': return 'C';
      case 'DAI': return 'D';
      default: return currencySymbol.charAt(0).toUpperCase() || '?';
    }
  };

  const maskValue = (value: string, start = 5, end = 5) => {
    if (!value || value.length < start + end) return value; // Return original if too short to mask meaningfully
    return `${value.substring(0, start)}...${value.substring(value.length - end)}`;
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-2">
          <Wallet className="h-8 w-8" /> Seed Phrase Auditor
        </h1>
        <p className="text-muted-foreground">
          Enter seed phrases to simulate address derivation and balance retrieval (EVM focused).
        </p>
      </header>

      <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/50 text-destructive dark:text-destructive [&>svg]:text-destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Security Warning & Simulation Notice</AlertTitle>
        <AlertDescription>
          <strong>Never enter real seed phrases into any online tool, including this one.</strong> This application is for demonstration purposes only and uses <code>ethers.js</code> for simulated address derivation. It <strong>does not</strong> connect to real wallets or blockchains. Addresses are derived locally, and balances are randomly generated for illustration.
        </AlertDescription>
      </Alert>

      <div className="mb-6 space-y-4">
        <Textarea
          placeholder="Paste your seed phrases here, one per line (e.g., standard 12 or 24 words)..."
          value={seedPhrasesInput}
          onChange={(e) => setSeedPhrasesInput(e.target.value)}
          rows={8}
          className="text-sm border-input focus:ring-accent focus:border-accent font-mono"
          disabled={isProcessing}
          aria-label="Seed Phrases Input"
        />
        <Button
          onClick={handleAudit}
          disabled={isProcessing}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          aria-label="Audit Balances Button"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            'Audit Phrases (Simulate)'
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Audit Results (Simulated)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Simulated derivation and balance results.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">Seed Phrase (Masked)</TableHead>
                  <TableHead className="w-[30%]">Derived Address (Masked)</TableHead>
                  <TableHead className="w-[15%] text-center">Wallet Type</TableHead>
                  <TableHead className="w-[15%] text-center">Primary Crypto</TableHead>
                  <TableHead className="w-[10%] text-right">Simulated Balance</TableHead>
                  <TableHead className="w-[5%] text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={index} className="hover:bg-secondary/50">
                    <TableCell className="font-mono text-xs align-top">
                      {maskValue(result.seedPhrase, 4, 4)}
                    </TableCell>
                    <TableCell className="font-mono text-xs align-top">
                      {result.auditData ? maskValue(result.auditData.derivedAddress, 6, 4) : result.error ? '-' : 'Deriving...'}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      {result.auditData ? (
                        <span className="inline-flex items-center gap-1 text-xs">
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
                    <TableCell className="text-right align-top">
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
    </div>
  );
}
