
'use server';

import { ethers } from 'ethers';

// Re-defining the interface here or importing from a shared types file
export interface AddressBalanceResult {
  address: string;
  balance: number;
  currency: string;
  isRealData: boolean;
  dataSource: 'Etherscan API' | 'BlockCypher API' | 'Alchemy API' | 'Blockstream API' | 'CryptoAPIs.io API' | 'Simulated Fallback' | 'N/A' | 'Unknown' | 'Error';
}


export interface ProcessedWalletInfo {
  seedPhrase: string;
  derivedAddress: string | null;
  walletType: string | null;
  balanceData: AddressBalanceResult[];
  error?: string | null;
  derivationError?: string | null;
  isRealData?: boolean; 
  cryptoName?: string; 
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
const CRYPTOAPIS_API_URL = 'https://rest.cryptoapis.io/v2/blockchain-data';


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
        const balance = parseFloat(ethers.formatEther(data.result)) || 0;
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

  const promises = coins.map(async (coin): Promise<AddressBalanceResult> => {
    try {
      const response = await fetch(
        `${BLOCKCYPHER_API_URL}/${coin}/main/addrs/${address}/balance?token=${apiKey}`
      );

      let responseBodyText: string | null = null;
      try {
          responseBodyText = await response.text();
      } catch (textError: any) {
          console.error(`BlockCypher API: Error reading response text for ${coin.toUpperCase()} at ${address}: ${textError.message}`);
          return { address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' as const };
      }

      if (!response.ok) {
        console.error(`BlockCypher API error for ${coin.toUpperCase()} at ${address}: ${response.status} ${responseBodyText}`);
        return { address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' as const };
      }
      
      let data;
      try {
          data = JSON.parse(responseBodyText);
      } catch (jsonError: any) {
          console.error(`BlockCypher API: Error parsing JSON response for ${coin.toUpperCase()} at ${address}: ${jsonError.message}. Response: ${responseBodyText}`);
          return { address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' as const };
      }

      let balance = 0;
      const balanceSource = data?.final_balance ?? data?.balance;

      if (typeof balanceSource === 'number' && balanceSource >= 0) { 
        if (coin === 'eth') {
          balance = parseFloat(ethers.formatEther(BigInt(balanceSource).toString())) || 0;
        } else if (['btc', 'ltc', 'doge', 'dash'].includes(coin)) {
          balance = parseFloat(ethers.formatUnits(BigInt(balanceSource).toString(), 8)) || 0; 
        }
      }
       return { address, balance, currency: coin.toUpperCase(), isRealData: true, dataSource: 'BlockCypher API' as const };
    } catch (error: any) {
      console.error(`Error fetching BlockCypher ${coin.toUpperCase()} balance for ${address}:`, error.message, error.stack);
      return { address, balance: 0, currency: coin.toUpperCase(), isRealData: false, dataSource: 'Error' as const };
    }
  });
  
  const settledResults = await Promise.allSettled(promises);
  settledResults.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  });

  return results;
}

export async function fetchAlchemyBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (Alchemy)', isRealData: false, dataSource: 'N/A' }];
  const evmNetworks = ['ETH', 'MATIC', 'ARBITRUM', 'OPTIMISM', 'BASE']; 
  const results: AddressBalanceResult[] = [];

  const promises = evmNetworks.map(async (network): Promise<AddressBalanceResult | null> => {
    const baseUrl = ALCHEMY_BASE_URLS[network];
    if (!baseUrl) return null; 

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
          return { address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' as const };
      }

      if (!response.ok) {
         console.error(`Alchemy API error for ${network} at ${address}: ${response.status} ${responseBodyText}`);
         return { address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' as const };
      }
      
      let data;
      try {
          data = JSON.parse(responseBodyText);
      } catch (jsonError: any) {
          console.error(`Alchemy API: Error parsing JSON response for ${network} at ${address}: ${jsonError.message}. Response: ${responseBodyText}`);
          return { address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' as const };
      }
      
      if (data && data.result && typeof data.result === 'string') {
        const balance = parseFloat(ethers.formatEther(data.result)) || 0;
        return { address, balance, currency: network, isRealData: true, dataSource: 'Alchemy API' as const };
      } else if (data && data.error) {
        console.warn(`Alchemy ${network}: ${data.error.message} for ${address}`);
        return { address, balance: 0, currency: network, isRealData: false, dataSource: 'N/A' as const }; 
      } else {
        console.warn(`Alchemy ${network}: Unexpected response structure for ${address}`, data);
        return { address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' as const };
      }
    } catch (error: any) {
      console.error(`Error fetching Alchemy ${network} balance for ${address}:`, error.message, error.stack);
      return { address, balance: 0, currency: network, isRealData: false, dataSource: 'Error' as const };
    }
  });

  const settledResults = await Promise.allSettled(promises);
  settledResults.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  });
  return results;
}


export async function fetchBlockstreamBalance(address: string, clientId?: string, clientSecret?: string): Promise<AddressBalanceResult[]> {
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
        if (responseBodyText && responseBodyText.toLowerCase().includes("invalid bitcoin address")) { 
            return [{ address, balance: 0, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }]; 
        }
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'Error' }];
    }

    if (data && data.chain_stats && typeof data.chain_stats.funded_txo_sum === 'number' && typeof data.chain_stats.spent_txo_sum === 'number') {
        const balanceSatoshis = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
        const balance = parseFloat(ethers.formatUnits(BigInt(balanceSatoshis).toString(), 8)) || 0; 
        return [{ address, balance, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API' }];
    } else {
        return [{ address, balance: 0, currency: 'BTC', isRealData: true, dataSource: 'Blockstream API'}];
    }

  } catch (error: any) {
    if (error.message?.includes('invalid bitcoin address') || error.message?.includes('Failed to fetch')) { 
        return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'N/A'}];
    }
    console.error(`Error fetching Blockstream BTC balance for ${address}:`, error.message, error.stack);
    return [{ address, balance: 0, currency: 'BTC', isRealData: false, dataSource: 'Error' }];
  }
}

export async function fetchCryptoApisBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (CryptoAPIs)', isRealData: false, dataSource: 'N/A' }];

  const chainsToQuery = [
    { name: 'BTC', blockchain: 'bitcoin', network: 'mainnet', decimals: 8 },
    { name: 'ETH', blockchain: 'ethereum', network: 'mainnet', decimals: 18 },
    { name: 'LTC', blockchain: 'litecoin', network: 'mainnet', decimals: 8 },
    { name: 'DOGE', blockchain: 'dogecoin', network: 'mainnet', decimals: 8 },
    { name: 'DASH', blockchain: 'dash', network: 'mainnet', decimals: 8 },
  ];

  const results: AddressBalanceResult[] = [];

  const promises = chainsToQuery.map(async (chain): Promise<AddressBalanceResult | null> => {
    try {
      const response = await fetch(
        `${CRYPTOAPIS_API_URL}/${chain.blockchain}/${chain.network}/addresses/${address}`,
        { headers: { 'X-API-Key': apiKey } }
      );

      let responseBodyText: string | null = null;
      try {
        responseBodyText = await response.text();
      } catch (textError: any) {
        console.error(`CryptoAPIs.io API: Error reading response text for ${chain.name} at ${address}: ${textError.message}`);
        return { address, balance: 0, currency: chain.name, isRealData: false, dataSource: 'Error' as const };
      }

      if (!response.ok) {
        // CryptoAPIs returns 400/404/422 for invalid address format for a given chain, treat as 0 balance for that chain
        if (response.status === 400 || response.status === 404 || response.status === 422) {
          // console.warn(`CryptoAPIs.io API: Address ${address} likely invalid or not found for ${chain.name}. Status: ${response.status}. Response: ${responseBodyText}`);
          return { address, balance: 0, currency: chain.name, isRealData: true, dataSource: 'CryptoAPIs.io API' as const };
        }
        console.error(`CryptoAPIs.io API error for ${chain.name} at ${address}: ${response.status} ${responseBodyText}`);
        return { address, balance: 0, currency: chain.name, isRealData: false, dataSource: 'Error' as const };
      }

      let data;
      try {
        data = JSON.parse(responseBodyText);
      } catch (jsonError: any) {
        console.error(`CryptoAPIs.io API: Error parsing JSON response for ${chain.name} at ${address}: ${jsonError.message}. Response: ${responseBodyText}`);
        return { address, balance: 0, currency: chain.name, isRealData: false, dataSource: 'Error' as const };
      }

      if (data && data.data && data.data.item && data.data.item.confirmedBalance && typeof data.data.item.confirmedBalance.amount === 'string') {
        const amountStr = data.data.item.confirmedBalance.amount;
        const balance = parseFloat(ethers.formatUnits(amountStr, chain.decimals)) || 0;
        return { address, balance, currency: chain.name, isRealData: true, dataSource: 'CryptoAPIs.io API' as const };
      } else {
        // This case can mean the address exists but has 0 balance, or the API response structure is unexpected
        // console.warn(`CryptoAPIs.io API: No balance data or unexpected structure for ${chain.name} at ${address}. Assuming 0 balance. Data:`, data);
        return { address, balance: 0, currency: chain.name, isRealData: true, dataSource: 'CryptoAPIs.io API' as const };
      }
    } catch (error: any) {
      console.error(`Error fetching CryptoAPIs.io ${chain.name} balance for ${address}:`, error.message, error.stack);
      return { address, balance: 0, currency: chain.name, isRealData: false, dataSource: 'Error' as const };
    }
  });

  const settledResults = await Promise.allSettled(promises);
  settledResults.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  });

  return results;
}


export async function processSeedPhrasesAndFetchBalances(
  seedPhrases: string[],
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
  blockstreamClientId?: string,
  blockstreamClientSecret?: string,
  cryptoApisApiKey?: string
): Promise<ProcessedWalletInfo[]> {
  const results: ProcessedWalletInfo[] = [];

  try {
    for (const phrase of seedPhrases) {
      let wallet: ethers.Wallet | null = null;
      let derivedAddress: string | null = null;
      let walletType: string = "Unknown"; 
      let derivationError: string | null = null;
      
      const allBalancesForPhrase: AddressBalanceResult[] = [];

      try {
        wallet = ethers.Wallet.fromPhrase(phrase);
        derivedAddress = wallet.address;
        walletType = "EVM (Ethereum-compatible)";
      } catch (e: any) {
        console.error(`Action: Error deriving wallet from seed phrase "${phrase.substring(0,20)}...": ${e.message}`);
        derivationError = `Derivation failed: ${e.message}`;
         results.push({
              seedPhrase: phrase,
              derivedAddress: null,
              walletType: null,
              balanceData: [],
              derivationError: derivationError,
              error: null
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
          const btcBalances = await fetchBlockstreamBalance(derivedAddress, blockstreamClientId, blockstreamClientSecret); 
          allBalancesForPhrase.push(...btcBalances);

          if (cryptoApisApiKey) {
              const caBalances = await fetchCryptoApisBalances(derivedAddress, cryptoApisApiKey);
              allBalancesForPhrase.push(...caBalances);
          }
      }
      
      const positiveRealBalances = allBalancesForPhrase.filter(b => b.isRealData && b.balance > 0 && b.dataSource !== 'Error' && b.dataSource !== 'N/A');
      const apiErrorOccurred = allBalancesForPhrase.some(b => b.dataSource === 'Error');
      
      if (positiveRealBalances.length > 0 && !derivationError) {
          results.push({
              seedPhrase: phrase,
              derivedAddress: derivedAddress,
              walletType: walletType,
              balanceData: positiveRealBalances, 
              derivationError: null, 
              error: apiErrorOccurred ? "Positive balance(s) found, but some API calls may have failed for other assets." : null
          });
      } else {
          if (!derivationError) { 
               // console.log(`Action: No positive balances found for seed phrase "${phrase.substring(0,20)}..." (Address: ${derivedAddress}). API errors: ${apiErrorOccurred}. Skipping.`);
          }
      }
    }
    return results;
  } catch (e: any) {
    console.error(`Critical unhandled error in processSeedPhrasesAndFetchBalances: ${e.message}`, e.stack);
    return results; 
  }
}

