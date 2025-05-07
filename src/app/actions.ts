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
  const coins = ['eth', 'btc', 'ltc', 'doge', 'dash']; // Removed bch as it might require different address format or not be reliably checked with EVM address
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
      if (data && typeof data.final_balance === 'number' && data.final_balance >= 0) { // Use final_balance, can be 0
        if (coin === 'eth') {
          balance = parseFloat(ethers.formatEther(BigInt(data.final_balance).toString()));
        } else if (['btc', 'ltc', 'doge', 'dash'].includes(coin)) {
          balance = parseFloat(ethers.formatUnits(BigInt(data.final_balance).toString(), 8)); 
        }
      } else if (data && typeof data.balance === 'number' && data.balance >=0) { // Fallback for some coins that use 'balance'
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
        results.push({ address, balance: 0, currency: network, isRealData: false, dataSource: 'N/A' }); // N/A for known API errors not related to rate limits
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
  // apiKey is not strictly used by public blockstream.info API but kept for consistency
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
        // Blockstream returns 400 for invalid Bitcoin address, which is common if using an EVM address.
        // Treat this as a valid check (address has no BTC history) rather than a hard API error.
        if (response.status === 400 || response.status === 404 || (responseBodyText && responseBodyText.toLowerCase().includes("invalid bitcoin address"))) {
             console.warn(`Blockstream: Address ${address} not found or invalid (likely non-BTC). Response: ${responseBodyText}`);
             return [{ address, balance: 0, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }]; // isRealData true, balance 0
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
        // This could happen if the address is valid BTC but has no transactions.
        console.warn(`Blockstream: Address ${address} found but no transaction stats. Assuming zero balance. Data:`, data);
        return [{ address, balance: 0, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API'}];
    }

  } catch (error: any) {
    // Catchall for network errors or unexpected issues.
    // If error indicates non-BTC address, treat as N/A rather than 'Error'
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
      continue; // Skip to next phrase if derivation fails
    }

    if (derivedAddress) {
        // Etherscan
        if (etherscanApiKey) {
            const ethBalances = await fetchEtherscanBalance(derivedAddress, etherscanApiKey);
            allBalancesForPhrase.push(...ethBalances);
        }
        // BlockCypher
        if (blockcypherApiKey) {
            const bcBalances = await fetchBlockcypherBalances(derivedAddress, blockcypherApiKey);
            allBalancesForPhrase.push(...bcBalances);
        }
        // Alchemy
        if (alchemyApiKey) {
            const alchemyBalances = await fetchAlchemyBalances(derivedAddress, alchemyApiKey);
            allBalancesForPhrase.push(...alchemyBalances);
        }
        // Blockstream (always try for BTC, apiKey is optional for public endpoint)
        const btcBalances = await fetchBlockstreamBalance(derivedAddress, blockstreamApiKey); 
        allBalancesForPhrase.push(...btcBalances);
    }
    
    // Filter for balances that are from real APIs, have a positive balance, and are not errors or N/A from the API fetch itself.
    const positiveRealBalances = allBalancesForPhrase.filter(b => b.isRealData && b.balance > 0 && b.dataSource !== 'Error' && b.dataSource !== 'N/A');
    const apiErrorOccurred = allBalancesForPhrase.some(b => b.dataSource === 'Error');
    
     if (positiveRealBalances.length > 0) {
        results.push({
            seedPhrase: phrase,
            derivedAddress: derivedAddress,
            walletType: walletType,
            balanceData: positiveRealBalances, // Only push positive, real balances
            derivationError: null, // Derivation was successful
            error: apiErrorOccurred ? "Positive balances found, but some API calls may have failed." : null
        });
    } else if (apiErrorOccurred) { // No positive balances, but API errors occurred
         results.push({ 
            seedPhrase: phrase,
            derivedAddress: derivedAddress,
            walletType: walletType,
            balanceData: [], // No positive balances to show
            derivationError: null, // Derivation was successful
            error: "API error(s) occurred and no positive balances found."
        });
    }
    // If no positiveRealBalances, no apiErrorOccurred, and derivation was successful (already handled by `continue`),
    // then this seed phrase (with all zero balances and no errors) is NOT added to results.
  }
  return results;
}