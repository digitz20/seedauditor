
'use server';

import { ethers } from 'ethers';

// Re-defining the interface here or importing from a shared types file
export interface AddressBalanceResult {
  address: string;
  balance: number;
  currency: string;
  isRealData: boolean;
  dataSource: 'Etherscan API' | 'BlockCypher API' | 'Alchemy API' | 'Blockstream API' | 'CryptoAPIs.io API' | 'Mobula.io API' | 'Moralis API' | 'Simulated Fallback' | 'N/A' | 'Unknown' | 'Error';
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
const MOBULA_API_URL = 'https://api.mobula.io/api/1';
const MORALIS_API_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';


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
        if (response.status === 400 || response.status === 404 || response.status === 422) {
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

export async function fetchMobulaBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (Mobula.io)', isRealData: false, dataSource: 'N/A' }];
  const results: AddressBalanceResult[] = [];

  // Placeholder: Mobula.io typically provides a portfolio view.
  // You'll need to replace this with the actual API call and response parsing.
  // This is a simplified example assuming a specific response structure.
  try {
    const response = await fetch(
      `${MOBULA_API_URL}/wallet/portfolio?wallet=${address}`, // This endpoint is a guess
      { headers: { 'authorization': apiKey } } // Common auth header for Mobula
    );

    let responseBodyText: string | null = null;
    try {
      responseBodyText = await response.text();
    } catch (textError: any) {
      console.error(`Mobula.io API: Error reading response text for ${address}: ${textError.message}`);
      return [{ address, balance: 0, currency: 'Unknown', isRealData: false, dataSource: 'Error' }];
    }

    if (!response.ok) {
      console.error(`Mobula.io API error for ${address}: ${response.status} ${responseBodyText}`);
      return [{ address, balance: 0, currency: 'Unknown', isRealData: false, dataSource: 'Error' }];
    }

    let data;
    try {
      data = JSON.parse(responseBodyText);
    } catch (jsonError: any) {
      console.error(`Mobula.io API: Error parsing JSON response for ${address}: ${jsonError.message}. Response: ${responseBodyText}`);
      return [{ address, balance: 0, currency: 'Unknown', isRealData: false, dataSource: 'Error' }];
    }

    if (data && data.data && Array.isArray(data.data.assets)) {
      for (const assetInfo of data.data.assets) {
        if (assetInfo && assetInfo.asset && typeof assetInfo.asset.symbol === 'string' &&
            typeof assetInfo.balance === 'number' && typeof assetInfo.asset.decimals === 'number') { // balance might be number
          try {
            // Mobula might provide balance in standard units, not wei. Adjust if needed.
            const balance = assetInfo.balance / (10 ** assetInfo.asset.decimals);
            results.push({
              address,
              balance: parseFloat(balance.toFixed(8)) || 0, // Format to reasonable precision
              currency: assetInfo.asset.symbol.toUpperCase(),
              isRealData: true,
              dataSource: 'Mobula.io API',
            });
          } catch (formatError: any) {
            console.error(`Mobula.io API: Error processing balance for ${assetInfo.asset.symbol} at ${address}: ${formatError.message}`);
          }
        }
      }
    } else {
       // console.warn(`Mobula.io API: Unexpected response structure or no assets for ${address}. Data:`, data);
    }

  } catch (error: any) {
    console.error(`Error fetching Mobula.io balances for ${address}:`, error.message, error.stack);
    return [{ address, balance: 0, currency: 'Unknown', isRealData: false, dataSource: 'Error' }];
  }
  return results;
}


export async function fetchMoralisBalances(address: string, apiKey?: string): Promise<AddressBalanceResult[]> {
  if (!apiKey) return [{ address, balance: 0, currency: 'Multiple (Moralis)', isRealData: false, dataSource: 'N/A' }];
  const results: AddressBalanceResult[] = [];
  const chains = ['eth', 'polygon', 'bsc', 'avalanche', 'fantom', 'arbitrum', 'base', 'optimism']; // Common EVM chains

  const headers = {
    'accept': 'application/json',
    'X-API-Key': apiKey,
  };

  // Fetch native balances
  const nativeBalancePromises = chains.map(async (chain): Promise<AddressBalanceResult | null> => {
    try {
      const response = await fetch(`${MORALIS_API_BASE_URL}/${address}/balance?chain=${chain}`, { headers });
      if (!response.ok) {
        const errorText = await response.text();
        // console.warn(`Moralis API (native ${chain}): ${response.status} for ${address}. ${errorText.substring(0, 100)}`);
        return null; // Don't treat as an error if address not found on chain
      }
      const data = await response.json();
      if (data && data.balance && typeof data.balance === 'string') {
        const balance = parseFloat(ethers.formatEther(data.balance)) || 0;
        if (balance > 0) {
          return { address, balance, currency: chain.toUpperCase(), isRealData: true, dataSource: 'Moralis API' };
        }
      }
      return null;
    } catch (error: any) {
      console.error(`Error fetching Moralis native balance for ${chain} at ${address}:`, error.message);
      return { address, balance: 0, currency: chain.toUpperCase(), isRealData: false, dataSource: 'Error' };
    }
  });

  // Fetch ERC20 token balances
  const erc20BalancePromises = chains.map(async (chain): Promise<AddressBalanceResult[] | null> => {
    try {
      const response = await fetch(`${MORALIS_API_BASE_URL}/${address}/erc20?chain=${chain}`, { headers });
      if (!response.ok) {
        const errorText = await response.text();
        // console.warn(`Moralis API (ERC20 ${chain}): ${response.status} for ${address}. ${errorText.substring(0,100)}`);
        return null;
      }
      const data = await response.json();
      const tokenBalances: AddressBalanceResult[] = [];
      if (Array.isArray(data)) {
        data.forEach((token: any) => {
          if (token.balance && token.decimals && token.symbol) {
            const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals)) || 0;
            if (balance > 0) {
              tokenBalances.push({
                address,
                balance,
                currency: `${token.symbol.toUpperCase()} (${chain.toUpperCase()})`, // Add chain to symbol for clarity
                isRealData: true,
                dataSource: 'Moralis API',
              });
            }
          }
        });
      }
      return tokenBalances;
    } catch (error: any) {
      console.error(`Error fetching Moralis ERC20 balances for ${chain} at ${address}:`, error.message);
      // Return a single error entry for this chain's ERC20 check
      return [{ address, balance: 0, currency: `ERC20 (${chain.toUpperCase()})`, isRealData: false, dataSource: 'Error' }];
    }
  });

  const settledNativeResults = await Promise.allSettled(nativeBalancePromises);
  settledNativeResults.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  });

  const settledErc20Results = await Promise.allSettled(erc20BalancePromises);
  settledErc20Results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(...result.value);
    }
  });

  return results.filter(r => r !== null) as AddressBalanceResult[];
}


export async function processSeedPhrasesAndFetchBalances(
  seedPhrases: string[],
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
  blockstreamClientId?: string,
  blockstreamClientSecret?: string,
  cryptoApisApiKey?: string,
  mobulaApiKey?: string,
  moralisApiKey?: string
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
          if (mobulaApiKey) {
              const mobBalances = await fetchMobulaBalances(derivedAddress, mobulaApiKey);
              allBalancesForPhrase.push(...mobBalances);
          }
          if (moralisApiKey) {
              const morBalances = await fetchMoralisBalances(derivedAddress, moralisApiKey);
              allBalancesForPhrase.push(...morBalances);
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
