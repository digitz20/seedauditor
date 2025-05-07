
'use server';

import { ethers } from 'ethers';

// Re-defining the interface here or importing from a shared types file
export interface AddressBalanceResult {
  address: string;
  balance: number;
  currency: string;
  isRealData: boolean;
  dataSource: 'Etherscan API' | 'BlockCypher API' | 'Alchemy API' | 'Blockstream API' | 'Simulated Fallback' | 'N/A' | 'Unknown' | 'Error';
}

export interface ProcessedWalletInfo {
  seedPhrase: string;
  derivedAddress: string | null;
  walletType: string | null;
  balanceData: AddressBalanceResult[];
  error?: string | null;
  derivationError?: string | null;
  isRealData?: boolean; // Consolidated from AddressBalanceResult
  cryptoName?: string; // Primary crypto name if one is found
}

const ETHERSCAN_API_URL = 'https://api.etherscan.io/api';
const BLOCKCYPHER_API_URL = 'https://api.blockcypher.com/v1';
const ALCHEMY_BASE_URLS: Record<string, string> = {
    // Alchemy URLs are typically per-network
    'ETH': 'https://eth-mainnet.g.alchemy.com/v2/',
    'MATIC': 'https://polygon-mainnet.g.alchemy.com/v2/',
    'ARBITRUM': 'https://arb-mainnet.g.alchemy.com/v2/',
    'OPTIMISM': 'https://opt-mainnet.g.alchemy.com/v2/',
    'BASE': 'https://base-mainnet.g.alchemy.com/v2/',
};
const BLOCKSTREAM_API_URL = 'https://blockstream.info/api';


export async function fetchEtherscanBalance(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: 'N/A' }];
  try {
    const response = await fetch(
      `${ETHERSCAN_API_URL}?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`
    );
    if (!response.ok) {
        console.error(`Etherscan API error: ${response.status} ${await response.text()}`);
        return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: 'Error' }];
    }
    const data = await response.json();
    if (data.status === '1') {
      const balance = parseFloat(ethers.formatEther(data.result));
      return [{ address, balance, currency: 'ETH', isRealData: true, dataSource: 'Etherscan API' }];
    } else {
      console.warn(`Etherscan: ${data.message} for ${address}`);
      return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: data.message === "NOTOK" && data.result.includes("Max rate limit reached") ? 'Error' : 'N/A' }];
    }
  } catch (error: any) {
    console.error('Error fetching Etherscan balance:', error.message);
    return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: 'Error' }];
  }
}

export async function fetchBlockcypherBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (BlockCypher)', isRealData: false, dataSource: 'N/A' }];
  const coins = ['eth', 'btc', 'ltc', 'doge', 'dash']; // Bitcoin Cash (bch) can also be added if API supports it well
  const results: AddressBalanceResult[] = [];

  for (const coin of coins) {
    try {
      const response = await fetch(
        `${BLOCKCYPHER_API_URL}/${coin}/main/addrs/${address}/balance?token=${apiKey}`
      );
      if (!response.ok) {
        console.error(`BlockCypher API error for ${coin.toUpperCase()}: ${response.status} ${await response.text()}`);
        results.push({ address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' });
        continue;
      }
      const data = await response.json();
      let balance = 0;
      if (data.balance > 0) {
        if (coin === 'eth') {
          balance = parseFloat(ethers.formatEther(BigInt(data.balance).toString()));
        } else if (['btc', 'ltc', 'doge', 'dash'].includes(coin)) {
          // Assuming 8 decimal places for BTC, LTC, DOGE, DASH. This might need adjustment per coin.
          balance = parseFloat(ethers.formatUnits(BigInt(data.balance).toString(), 8)); 
        }
      }
       results.push({ address, balance, currency: coin.toUpperCase(), isRealData: true, dataSource: 'BlockCypher API' });
    } catch (error: any) {
      console.error(`Error fetching BlockCypher ${coin.toUpperCase()} balance:`, error.message);
      results.push({ address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' });
    }
  }
  return results;
}

export async function fetchAlchemyBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (Alchemy)', isRealData: false, dataSource: 'N/A' }];
  const evmNetworks = ['ETH', 'MATIC', 'ARBITRUM', 'OPTIMISM', 'BASE']; // Add more as needed
  const results: AddressBalanceResult[] = [];

  for (const network of evmNetworks) {
    const baseUrl = ALCHEMY_BASE_URLS[network];
    if (!baseUrl) continue;

    try {
      const response = await fetch(`${baseUrl}${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1,
        }),
      });
      if (!response.ok) {
         console.error(`Alchemy API error for ${network}: ${response.status} ${await response.text()}`);
         results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' });
         continue;
      }
      const data = await response.json();
      if (data.result) {
        const balance = parseFloat(ethers.formatEther(data.result));
        results.push({ address, balance, currency: network, isRealData: true, dataSource: 'Alchemy API' });
      } else if (data.error) {
        console.warn(`Alchemy ${network}: ${data.error.message} for ${address}`);
        results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'N/A' });
      }
    } catch (error: any) {
      console.error(`Error fetching Alchemy ${network} balance:`, error.message);
      results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' });
    }
  }
  return results;
}


export async function fetchBlockstreamBalance(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  // Blockstream API for BTC doesn't typically require an API key for basic address lookups.
  // The apiKey param is kept for consistency but might not be used by the public endpoint.
  // If an API key is provided and the API supports it, it would be used. For now, assuming public access.
  try {
    const response = await fetch(`${BLOCKSTREAM_API_URL}/address/${address}`);
    if (!response.ok) {
        if (response.status === 400 || response.status === 404) {
             console.warn(`Blockstream: Address ${address} not found or invalid (likely non-BTC).`);
             // It's not an error if the address isn't a BTC address or has no BTC transactions.
             return [{ address, balance: 0, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }]; 
        }
        console.error(`Blockstream API error: ${response.status} ${await response.text()}`);
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'Error' }];
    }
    const data = await response.json();
    const balanceSatoshis = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
    const balance = parseFloat(ethers.formatUnits(BigInt(balanceSatoshis).toString(), 8)); // BTC has 8 decimal places
    return [{ address, balance, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }];
  } catch (error: any) {
    if (error.message?.includes('invalid bitcoin address') || error.message?.includes('Failed to fetch') || error.message?.includes('JSON.parse')) {
        console.warn(`Blockstream: Error likely due to non-BTC address ${address} or unexpected response: ${error.message}`);
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'N/A'}];
    }
    console.error('Error fetching Blockstream BTC balance:', error.message);
    return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'Error' }];
  }
}


export async function processSeedPhrasesAndFetchBalances(
  seedPhrases: string[],
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
  blockstreamApiKey?: string 
): Promise<ProcessedWalletInfo[]> {
  const results: ProcessedWalletInfo[] = [];

  for (const phrase of seedPhrases) {
    let wallet: ethers.Wallet | null = null;
    let derivedAddress: string | null = null;
    let derivationError: string | null = null;
    let walletType: string = "Unknown"; 
    
    const allBalancesForPhrase: AddressBalanceResult[] = [];

    try {
      wallet = ethers.Wallet.fromPhrase(phrase);
      derivedAddress = wallet.address;
      walletType = "EVM (Ethereum-compatible)";
    } catch (e: any) {
      console.error(`Error deriving wallet from seed phrase "${phrase.substring(0,20)}...": ${e.message}`);
      derivationError = e.message || "Unknown derivation error";
       results.push({
        seedPhrase: phrase,
        derivedAddress: null,
        walletType: null,
        balanceData: [],
        derivationError: derivationError,
        error: "Failed to derive wallet."
      });
      continue; 
    }

    if (derivedAddress) {
        if (etherscanApiKey) {
            const ethBalances = await fetchEtherscanBalance(derivedAddress, etherscanApiKey);
            allBalancesForPhrase.push(...ethBalances);
        }
        if (blockcypherApiKey) {
            const bcBalances = await fetchBlockcypherBalances(derivedAddress, blockcypherApiKey);
            allBalancesForPhrase.push(...bcBalances);
        }
        if (alchemyApiKey) {
            const alchemyBalances = await fetchAlchemyBalances(derivedAddress, alchemyApiKey);
            allBalancesForPhrase.push(...alchemyBalances);
        }
        // Blockstream for BTC - always try if address is derived.
        const btcBalances = await fetchBlockstreamBalance(derivedAddress, blockstreamApiKey); 
        allBalancesForPhrase.push(...btcBalances);
    }
    
    const positiveRealBalances = allBalancesForPhrase.filter(b => b.isRealData && b.balance > 0 && b.dataSource !== 'Error' && b.dataSource !== 'N/A');
    
     if (positiveRealBalances.length > 0) {
        results.push({
            seedPhrase: phrase,
            derivedAddress: derivedAddress,
            walletType: walletType,
            balanceData: positiveRealBalances, 
            derivationError: derivationError,
            error: null
        });
    } else if (derivationError) { // If derivation failed, still include it.
         results.push({
            seedPhrase: phrase,
            derivedAddress: derivedAddress, // could be null
            walletType: walletType, // could be "Unknown"
            balanceData: [], // No positive balances found
            derivationError: derivationError,
            error: "Failed to derive wallet or no positive balances found."
        });
    } else if (allBalancesForPhrase.some(b => b.dataSource === 'Error')) { // If API errors but no positive balances
         results.push({ 
            seedPhrase: phrase,
            derivedAddress: derivedAddress,
            walletType: walletType,
            balanceData: allBalancesForPhrase.filter(b => b.dataSource === 'Error' || (b.dataSource ==='N/A' && !b.isRealData)), 
            derivationError: derivationError,
            error: "API error(s) occurred or no positive balances found."
        });
    } else if (allBalancesForPhrase.length > 0 && positiveRealBalances.length === 0) { // If all were attempted but all were zero or N/A
         results.push({
            seedPhrase: phrase,
            derivedAddress: derivedAddress,
            walletType: walletType,
            balanceData: allBalancesForPhrase, // Show all attempted if no positive ones
            derivationError: derivationError,
            error: "No positive balances found across checked APIs."
        });
    }
    // If no positive balances, no derivation error, and no API errors, the phrase is effectively skipped from results unless explicitly handled here.
    // The current logic focuses on phrases with positive balances or errors.
  }

  return results;
}

