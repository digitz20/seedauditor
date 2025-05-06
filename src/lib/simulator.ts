/**
 * Represents the simulated balance data for a wallet.
 */
export interface SimulatedBalance {
  balance: number;
  currency: string; // e.g., 'ETH', 'BTC', 'USD equivalent'
}

/**
 * Simulates fetching a wallet balance for a given seed phrase.
 * IMPORTANT: This is a simulation only. It does not interact with any real wallets or blockchains.
 * It returns a random balance for demonstration purposes.
 * NEVER use real seed phrases in a production frontend application like this.
 *
 * @param seedPhrase The seed phrase (only used for logging in simulation, not for actual wallet access).
 * @returns A Promise that resolves with simulated balance data.
 */
export async function simulateFetchBalance(seedPhrase: string): Promise<SimulatedBalance> {
  console.log(`Simulating balance fetch for phrase starting with: ${seedPhrase.substring(0, 5)}...`);

  // Simulate network delay
  const delay = Math.random() * 1000 + 200; // 200ms to 1200ms delay
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate potential errors occasionally
  if (Math.random() < 0.05) { // 5% chance of error
      throw new Error("Simulated network error: Failed to fetch balance.");
  }

  // Generate random balance data
  const balance = parseFloat((Math.random() * 10).toFixed(4)); // Random balance between 0 and 10
  const currencies = ['ETH', 'BTC', 'SOL', 'MATIC', 'USDT'];
  const currency = currencies[Math.floor(Math.random() * currencies.length)];

  return { balance, currency };
}
