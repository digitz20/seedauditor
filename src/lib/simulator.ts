import { ethers } from "ethers";

/**
 * Represents the simulated balance data for a wallet.
 */
export interface SimulatedBalance {
  address: string; // Simulated address derived from the phrase
  balance: number;
  currency: string; // e.g., 'ETH', 'BTC', 'USD equivalent'
}

/**
 * Simulates fetching a wallet balance for a given seed phrase using ethers.js concepts.
 * IMPORTANT: This is a simulation only. It does not connect to any real blockchains
 * or perform actual network requests to get balances. It returns a random balance
 * for demonstration purposes after simulating address derivation.
 * NEVER use real seed phrases in a production frontend application like this,
 * especially not for direct balance checking or transactions.
 *
 * @param seedPhrase The seed phrase (used for simulated address derivation).
 * @returns A Promise that resolves with simulated balance data including a derived address.
 * @throws If the seed phrase is invalid according to ethers.js validation (basic check).
 */
export async function simulateFetchBalance(seedPhrase: string): Promise<SimulatedBalance> {
  console.log(`Simulating balance fetch for phrase starting with: ${seedPhrase.substring(0, 5)}...`);

  let simulatedAddress = "0xSIMULATED_ADDRESS";
  try {
    // Simulate deriving an address using ethers.js.
    // This validates the phrase format to some extent.
    // IN A REAL APP, NEVER DO THIS CLIENT-SIDE WITH USER-PROVIDED PHRASES.
    const wallet = ethers.Wallet.fromPhrase(seedPhrase);
    simulatedAddress = wallet.address;
    console.log(`Simulated derivation of address: ${simulatedAddress}`);
  } catch (error: any) {
    console.warn(`Invalid seed phrase format (simulation): ${error.message}`);
    throw new Error("Invalid seed phrase format (simulation)."); // Re-throw a user-friendly simulation error
  }


  // Simulate network delay
  const delay = Math.random() * 1000 + 200; // 200ms to 1200ms delay
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate potential network errors occasionally
  if (Math.random() < 0.05) { // 5% chance of error
    // Intentionally keeping this potential error for simulation purposes
    // console.warn("Simulated network error: Failed to fetch balance."); // Log the warning internally
    throw new Error("Simulated network error: Failed to fetch balance.");
  }

  // Generate random balance data
  const balance = parseFloat((Math.random() * 10).toFixed(4)); // Random balance between 0 and 10
  const currencies = ['ETH', 'BTC', 'SOL', 'MATIC', 'USDT'];
  const currency = currencies[Math.floor(Math.random() * currencies.length)];

  return { address: simulatedAddress, balance, currency };
}
