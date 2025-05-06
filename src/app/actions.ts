'use server';

import { ethers } from 'ethers';

/**
 * Represents the result of analyzing a seed phrase and simulating its balance.
 */
export interface SeedPhraseAuditResult {
  derivedAddress: string;
  walletType: string; // e.g., 'EVM'
  cryptoName: string; // e.g., 'ETH' - The primary crypto for this wallet type
  simulatedBalance: number;
  simulatedCurrency: string; // The currency of the simulated balance (e.g., ETH, USDC)
}

/**
 * Analyzes a seed phrase to derive an address and simulates its balance.
 * IMPORTANT: This is a simulation. It uses ethers.js for address derivation
 * but generates random balance data.
 * NEVER use real seed phrases in a production frontend application like this
 * for direct wallet operations.
 *
 * @param seedPhrase The seed phrase.
 * @returns A Promise that resolves with the audit result.
 * @throws If the seed phrase is invalid or a simulation error occurs.
 */
export async function analyzeSeedPhraseAndSimulateBalance(seedPhrase: string): Promise<SeedPhraseAuditResult> {
  console.log(`Analyzing seed phrase starting with: ${seedPhrase.substring(0, 5)}...`);

  let derivedAddress: string;
  try {
    // Simulate deriving an address using ethers.js.
    const wallet = ethers.Wallet.fromPhrase(seedPhrase);
    derivedAddress = wallet.address;
    console.log(`Simulated derivation of address: ${derivedAddress} for phrase.`);
  } catch (error: any) {
    console.warn(`Invalid seed phrase format (simulation): ${error.message}`);
    // For user feedback, it's better to throw an error that can be caught and displayed.
    // However, since the user reported a console error for the network part,
    // we'll ensure this one is also distinct.
    throw new Error(`Invalid seed phrase: ${error.message?.split('(')[0]?.trim() || 'Could not derive address'}. (Simulation)`);
  }

  // Simulate network delay for balance fetching part
  const delay = Math.random() * 800 + 200; // 200ms to 1000ms delay
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate potential network errors occasionally for balance fetching
  if (Math.random() < 0.03) { // 3% chance of error
    console.warn("Simulated network error during balance fetch.");
    throw new Error('Simulated network error: Failed to fetch balance. (Simulation)');
  }

  // Generate random balance data - for EVM, we can simulate ETH or a common ERC20
  const balance = parseFloat((Math.random() * 10).toFixed(4)); // Random balance between 0 and 10
  const evmCurrencies = ['ETH', 'USDC', 'DAI', 'USDT']; // Example currencies for EVM
  const currency = evmCurrencies[Math.floor(Math.random() * evmCurrencies.length)];

  return {
    derivedAddress,
    walletType: 'EVM', // Simplified to EVM for this simulation
    cryptoName: 'ETH', // Primary crypto for EVM
    simulatedBalance: balance,
    simulatedCurrency: currency,
  };
}
