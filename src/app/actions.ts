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

    let responseBodyText: string | null = null;
    try {
        responseBodyText = await response.text();
    } catch (textError: any) {
        console.error(`Etherscan API: Error reading response text for ${address}: ${textError.message}`);
        return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: 'Error' }];
    }

    if (!response.ok) {
        console.error(`Etherscan API error: ${response.status} ${responseBodyText}`);
        const dataSourceType = response.status === 429 || (responseBodyText && responseBodyText.includes("Max rate limit reached")) ? 'Error' : 'N/A';
        return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: dataSourceType }];
    }

    let data;
    try {
        data = JSON.parse(responseBodyText);
    } catch (jsonError: any) {
        console.error(`Etherscan API: Error parsing JSON response for ${address}: ${jsonError.message}. Response body: ${responseBodyText}`);
        return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: 'Error' }];
    }
    
    if (data.status === '1') {
      if (typeof data.result === 'string' && /^\d+$/.test(data.result)) {
        const balance = parseFloat(ethers.formatEther(data.result));
        return [{ address, balance, currency: 'ETH', isRealData: true, dataSource: 'Etherscan API' }];
      } else {
        console.error(`Etherscan API: Invalid balance format in data.result for ${address}`, data.result);
        return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: 'Error' }];
      }
    } else {
      console.warn(`Etherscan: Message - "${data.message}", Result - "${data.result}" for address ${address}`);
      const dataSourceType = data.message === "NOTOK" && data.result && typeof data.result === 'string' && data.result.includes("Max rate limit reached") ? 'Error' : 'N/A';
      return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: dataSourceType }];
    }
  } catch (error: any) {
    console.error(`Error fetching Etherscan balance for ${address}:`, error.message, error.stack);
    return [{ address, balance: 0, currency: 'ETH', isRealData: false, dataSource: 'Error' }];
  }
}

export async function fetchBlockcypherBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (BlockCypher)', isRealData: false, dataSource: 'N/A' }];
  const coins = ['eth', 'btc', 'ltc', 'doge', 'dash'];
  const results: AddressBalanceResult[] = [];

  for (const coin of coins) {
    try {
      const response = await fetch(
        `${BLOCKCYPHER_API_URL}/${coin}/main/addrs/${address}/balance?token=${apiKey}`
      );

      let responseBodyText: string | null = null;
      try {
          responseBodyText = await response.text();
      } catch (textError: any) {
          console.error(`BlockCypher API: Error reading response text for ${coin.toUpperCase()} at ${address}: ${textError.message}`);
          results.push({ address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' });
          continue;
      }

      if (!response.ok) {
        console.error(`BlockCypher API error for ${coin.toUpperCase()} at ${address}: ${response.status} ${responseBodyText}`);
        results.push({ address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' });
        continue;
      }
      
      let data;
      try {
          data = JSON.parse(responseBodyText);
      } catch (jsonError: any) {
          console.error(`BlockCypher API: Error parsing JSON response for ${coin.toUpperCase()} at ${address}: ${jsonError.message}. Response: ${responseBodyText}`);
          results.push({ address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' });
          continue;
      }

      let balance = 0;
      if (data && typeof data.balance === 'number' && data.balance > 0) {
        if (coin === 'eth') {
          balance = parseFloat(ethers.formatEther(BigInt(data.balance).toString()));
        } else if (['btc', 'ltc', 'doge', 'dash'].includes(coin)) {
          balance = parseFloat(ethers.formatUnits(BigInt(data.balance).toString(), 8)); 
        }
      }
       results.push({ address, balance, currency: coin.toUpperCase(), isRealData: true, dataSource: 'BlockCypher API' });
    } catch (error: any) {
      console.error(`Error fetching BlockCypher ${coin.toUpperCase()} balance for ${address}:`, error.message, error.stack);
      results.push({ address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' });
    }
  }
  return results;
}

export async function fetchAlchemyBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (Alchemy)', isRealData: false, dataSource: 'N/A' }];
  const evmNetworks = ['ETH', 'MATIC', 'ARBITRUM', 'OPTIMISM', 'BASE']; 
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

      let responseBodyText: string | null = null;
      try {
          responseBodyText = await response.text();
      } catch (textError: any) {
          console.error(`Alchemy API: Error reading response text for ${network} at ${address}: ${textError.message}`);
          results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' });
          continue;
      }

      if (!response.ok) {
         console.error(`Alchemy API error for ${network} at ${address}: ${response.status} ${responseBodyText}`);
         results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' });
         continue;
      }
      
      let data;
      try {
          data = JSON.parse(responseBodyText);
      } catch (jsonError: any) {
          console.error(`Alchemy API: Error parsing JSON response for ${network} at ${address}: ${jsonError.message}. Response: ${responseBodyText}`);
          results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' });
          continue;
      }
      
      if (data && data.result && typeof data.result === 'string') {
        const balance = parseFloat(ethers.formatEther(data.result));
        results.push({ address, balance, currency: network, isRealData: true, dataSource: 'Alchemy API' });
      } else if (data && data.error) {
        console.warn(`Alchemy ${network}: ${data.error.message} for ${address}`);
        results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'N/A' });
      } else {
        console.warn(`Alchemy ${network}: Unexpected response structure for ${address}`, data);
        results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' });
      }
    } catch (error: any) {
      console.error(`Error fetching Alchemy ${network} balance for ${address}:`, error.message, error.stack);
      results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' });
    }
  }
  return results;
}


export async function fetchBlockstreamBalance(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  try {
    const response = await fetch(`${BLOCKSTREAM_API_URL}/address/${address}`);
    
    let responseBodyText: string | null = null;
    try {
        responseBodyText = await response.text();
    } catch (textError: any) {
        console.error(`Blockstream API: Error reading response text for ${address}: ${textError.message}`);
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'Error' }];
    }

    if (!response.ok) {
        if (response.status === 400 || response.status === 404 || (responseBodyText && responseBodyText.toLowerCase().includes("invalid bitcoin address"))) {
             console.warn(`Blockstream: Address ${address} not found or invalid (likely non-BTC). Response: ${responseBodyText}`);
             return [{ address, balance: 0, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }]; 
        }
        console.error(`Blockstream API error for ${address}: ${response.status} ${responseBodyText}`);
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'Error' }];
    }
    
    let data;
    try {
        data = JSON.parse(responseBodyText);
    } catch (jsonError: any) {
        console.error(`Blockstream API: Error parsing JSON response for ${address}: ${jsonError.message}. Response: ${responseBodyText}`);
        if (responseBodyText && responseBodyText.toLowerCase().includes("invalid bitcoin address")) { // Double check common error string
            return [{ address, balance: 0, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }]; // Treat as no BTC balance
        }
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'Error' }];
    }

    if (data && data.chain_stats && typeof data.chain_stats.funded_txo_sum === 'number' && typeof data.chain_stats.spent_txo_sum === 'number') {
        const balanceSatoshis = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
        const balance = parseFloat(ethers.formatUnits(BigInt(balanceSatoshis).toString(), 8));
        return [{ address, balance, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }];
    } else {
        console.warn(`Blockstream: Unexpected data structure for ${address}. Data:`, data);
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'N/A'}];
    }

  } catch (error: any) {
    if (error.message?.includes('invalid bitcoin address') || error.message?.includes('Failed to fetch')) {
        console.warn(`Blockstream: Error likely due to non-BTC address ${address} or network issue: ${error.message}`);
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'N/A'}];
    }
    console.error(`Error fetching Blockstream BTC balance for ${address}:`, error.message, error.stack);
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
    } else if (derivationError) { 
         results.push({
            seedPhrase: phrase,
            derivedAddress: derivedAddress, 
            walletType: walletType, 
            balanceData: [], 
            derivationError: derivationError,
            error: "Failed to derive wallet or no positive balances found."
        });
    } else if (allBalancesForPhrase.some(b => b.dataSource === 'Error')) { 
         results.push({ 
            seedPhrase: phrase,
            derivedAddress: derivedAddress,
            walletType: walletType,
            balanceData: allBalancesForPhrase.filter(b => b.dataSource === 'Error' || (b.dataSource ==='N/A' && !b.isRealData)), 
            derivationError: derivationError,
            error: "API error(s) occurred or no positive balances found."
        });
    } else if (allBalancesForPhrase.length > 0 && positiveRealBalances.length === 0) { 
         results.push({
            seedPhrase: phrase,
            derivedAddress: derivedAddress,
            walletType: walletType,
            balanceData: allBalancesForPhrase, 
            derivationError: derivationError,
            error: "No positive balances found across checked APIs."
        });
    }
  }
  return results;
}

