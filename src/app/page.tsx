"use client";

import * as React from "react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Loader2 } from "lucide-react";
import { simulateFetchBalance, type SimulatedBalance } from "@/lib/simulator";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Ensure Card components are imported

interface ResultRow {
  seedPhrase: string;
  balanceData: SimulatedBalance | null;
  error: string | null;
  isLoading: boolean;
}

export default function Home() {
  const [seedPhrasesInput, setSeedPhrasesInput] = useState<string>("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { toast } = useToast();

  const handleAudit = async () => {
    const phrases = seedPhrasesInput
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (phrases.length === 0) {
      toast({
        title: "No Seed Phrases Entered",
        description: "Please enter at least one seed phrase.",
        variant: "destructive",
      });
      return;
    }
     if (phrases.length > 1000) {
      toast({
        title: "Too Many Seed Phrases",
        description: "Please enter no more than 1000 seed phrases at a time for this simulation.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResults(
      phrases.map((phrase) => ({
        seedPhrase: phrase,
        balanceData: null,
        error: null,
        isLoading: true,
      }))
    );

    // Process phrases one by one for simulation clarity
    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      try {
        // IMPORTANT: Using the simulation function
        const balanceData = await simulateFetchBalance(phrase);
        setResults((prevResults) =>
          prevResults.map((r, index) =>
            index === i
              ? { ...r, balanceData: balanceData, isLoading: false }
              : r
          )
        );
      } catch (error: any) {
        console.warn("Simulated error caught:", error.message); // Use console.warn instead of console.error for expected simulation errors
        setResults((prevResults) =>
          prevResults.map((r, index) =>
            index === i
              ? {
                  ...r,
                  error:
                    error.message || "An unknown simulation error occurred",
                  isLoading: false,
                }
              : r
          )
        );
        toast({
          title: "Simulation Error",
          description: `Failed to simulate balance for a phrase: ${error.message}`,
          variant: "destructive",
        });
      }
    }

    setIsProcessing(false);
    toast({
      title: "Simulation Complete",
      description: `Finished processing ${phrases.length} seed phrases.`,
    });
  };

  // Simple icon mapping simulation
  const getCurrencyIcon = (currency: string) => {
    switch (currency.toUpperCase()) {
      case 'ETH': return 'Ξ'; // Ethereum Symbol
      case 'BTC': return '₿'; // Bitcoin Symbol
      case 'SOL': return ' S '; // Placeholder
      case 'MATIC': return ' M '; // Placeholder
      case 'USDT': return ' T '; // Placeholder
      default: return '?';
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2">SeedPhrase Auditor</h1>
        <p className="text-muted-foreground">
          Enter seed phrases to simulate balance retrieval.
        </p>
      </header>

      <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/50 text-destructive dark:text-destructive [&>svg]:text-destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Security Warning & Simulation Notice</AlertTitle>
        <AlertDescription>
          <strong>Never enter real seed phrases into any online tool, including this one.</strong> This application is for demonstration purposes only and simulates wallet interactions. It does not connect to real wallets or blockchains. Balances shown are randomly generated.
        </AlertDescription>
      </Alert>

      <div className="mb-6 space-y-4">
        <Textarea
          placeholder="Paste your seed phrases here, one per line..."
          value={seedPhrasesInput}
          onChange={(e) => setSeedPhrasesInput(e.target.value)}
          rows={10}
          className="text-sm border-input focus:ring-accent focus:border-accent"
          disabled={isProcessing}
        />
        <Button
            onClick={handleAudit}
            disabled={isProcessing}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center gap-2"
        >
            {isProcessing ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                </>
            ) : (
                'Audit Balances (Simulate)'
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
              <TableCaption>Simulated balance results for entered phrases.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60%]">Seed Phrase (Masked)</TableHead>
                  <TableHead className="text-right">Simulated Balance</TableHead>
                  <TableHead className="w-[100px] text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={index} className="hover:bg-secondary/50">
                    <TableCell className="font-mono text-xs">
                      {`${result.seedPhrase.substring(0, 5)}...${result.seedPhrase.substring(result.seedPhrase.length - 5)}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {result.balanceData ? (
                        <span className="flex items-center justify-end gap-2 font-medium">
                           <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold">
                             {getCurrencyIcon(result.balanceData.currency)}
                           </span>
                          {result.balanceData.balance.toFixed(4)}{" "}
                          <span className="text-muted-foreground text-xs">{result.balanceData.currency}</span>
                        </span>
                      ) : result.error ? (
                        <span className="text-destructive text-xs italic">Error</span>
                      ) : result.isLoading ? (
                        <span className="text-muted-foreground text-xs">Loading...</span>
                      ) : (
                         <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                     <TableCell className="text-right">
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
