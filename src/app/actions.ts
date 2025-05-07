// @ts-nocheck
'use server';

import { ethers } from 'ethers';

/**
 * Represents the balance data fetched for a specific address.
 */
export interface AddressBalanceResult {
  address: string;
  balance: number;
  currency: string; // e.g., ETH, BTC, MATIC, ETH (Arbitrum)
  isRealData: boolean; // True if fetched from a real API, false if simulated
  dataSource: 'Etherscan API' | 'BlockCypher API' | 'Alchemy API' | 'Simulated Fallback' | 'N/A' | 'Unknown'; // To indicate source
}

/**
 * Represents the processed data for a single seed phrase, including derived address and balance.
 */
export interface ProcessedWalletInfo {
  seedPhrase: string;
  derivedAddress: string | null;
  walletType: string | null; // e.g., 'Ethereum Virtual Machine'
  cryptoName: string | null; // e.g., 'ETH', 'BTC' - This will come from AddressBalanceResult.currency
  balanceData: AddressBalanceResult | null;
  error: string | null; // General error for the row, or balance fetch error
  derivationError: string | null; // Specific error during address derivation
}

const BLOCKCYPHER_COINS_ACTIONS: string[] = ['eth', 'btc', 'ltc', 'doge', 'dash'];

interface AlchemyChain {
  id: string;
  name: string;
  symbol: string;
  endpointFragment: string;
  displayName: string; // For user-facing currency name
}

const ALCHEMY_EVM_CHAINS: AlchemyChain[] = [
  { id: 'eth', name: 'Ethereum', symbol: 'ETH', endpointFragment: 'eth-mainnet', displayName: 'ETH' },
  { id: 'polygon', name: 'Polygon', symbol: 'MATIC', endpointFragment: 'polygon-mainnet', displayName: 'MATIC' },
  { id: 'arbitrum', name: 'Arbitrum One', symbol: 'ETH', endpointFragment: 'arb-mainnet', displayName: 'ETH (Arbitrum)' },
  { id: 'optimism', name: 'Optimism', symbol: 'ETH', endpointFragment: 'opt-mainnet', displayName: 'ETH (Optimism)' },
  { id: 'base', name: 'Base', symbol: 'ETH', endpointFragment: 'base-mainnet', displayName: 'ETH (Base)' },
];


/**
 * Fetches the balance for a given Ethereum address.
 * Tries Etherscan first (ETH), then BlockCypher (multiple cryptos), then Alchemy (multiple EVM chains).
 *
 * @param address The Ethereum address to fetch the balance for.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @param alchemyApiKey (Optional) The Alchemy API key.
 * @returns A Promise that resolves with the address balance and data source.
 */
export async function fetchAddressBalance(
  address: string,
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
): Promise<AddressBalanceResult> {
  console.log(`Fetching balance for address: ${address}. Etherscan: ${!!etherscanApiKey}, BlockCypher: ${!!blockcypherApiKey}, Alchemy: ${!!alchemyApiKey}`);

  if (!ethers.isAddress(address)) {
    console.warn(`Address ${address} is not a valid Ethereum checksum address. Proceeding with balance checks, but this might fail for ETH-specific APIs.`);
  }

  // Try Etherscan API (ETH mainnet only)
  if (etherscanApiKey) {
    try {
      const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
      const balanceBigInt = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balanceBigInt);
      console.log(`Balance for ${address} from Etherscan: ${balanceEth} ETH`);
      if (parseFloat(balanceEth) > 0) {
        return {
          address,
          balance: parseFloat(balanceEth),
          currency: 'ETH',
          isRealData: true,
          dataSource: 'Etherscan API',
        };
      }
    } catch (error: any) {
      console.error(`Etherscan API error for ${address}: ${error.message}. Trying next available API.`);
    }
  }

  // Try BlockCypher API for multiple coins (BTC, LTC, DOGE, DASH, and ETH as fallback)
  if (blockcypherApiKey) {
    for (const coin of BLOCKCYPHER_COINS_ACTIONS) {
      try {
        const response = await fetch(`https://api.blockcypher.com/v1/${coin}/main/addrs/${address}/balance?token=${blockcypherApiKey}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `Unknown error parsing BlockCypher error for ${coin.toUpperCase()}` }));
          console.warn(`BlockCypher API error for ${address} (${coin.toUpperCase()}): ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}.`);
          continue; 
        }
        const data = await response.json();
        const balanceInSmallestUnit = BigInt(data.final_balance || data.balance || 0);
        
        let balanceCoin = 0;
        if (balanceInSmallestUnit > 0) {
          const decimals = (coin.toLowerCase() === 'eth') ? 18 : 8; 
          balanceCoin = parseFloat(ethers.formatUnits(balanceInSmallestUnit, decimals));
        }

        console.log(`Balance for ${address} from BlockCypher (${coin.toUpperCase()}): ${balanceCoin} ${coin.toUpperCase()}`);
        if (balanceCoin > 0) {
          return {
            address,
            balance: balanceCoin,
            currency: coin.toUpperCase(),
            isRealData: true,
            dataSource: 'BlockCypher API',
          };
        }
      } catch (error: any) {
        console.error(`BlockCypher API error for ${address} (${coin.toUpperCase()}): ${error.message}. Trying next coin.`);
      }
    }
  }

  // Try Alchemy API for multiple EVM chains
  if (alchemyApiKey) {
    for (const chain of ALCHEMY_EVM_CHAINS) {
      try {
        const alchemyUrl = `https://${chain.endpointFragment}.g.alchemy.com/v2/${alchemyApiKey}`;
        const requestBody = {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [address, "latest"],
        };
        const response = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Unknown Alchemy error on ${chain.name}` }));
            console.warn(`Alchemy API error for ${address} on ${chain.name}: ${response.status} ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
            continue;
        }
        
        const data = await response.json();
        if (data.result) {
            // Most EVM chains use 18 decimals for their native currency (ETH, MATIC)
            const balanceNative = ethers.formatUnits(BigInt(data.result), 18); 
            console.log(`Balance for ${address} from Alchemy on ${chain.name}: ${balanceNative} ${chain.symbol}`);
            const balance = parseFloat(balanceNative);
            if (balance > 0) {
                return {
                    address,
                    balance: balance,
                    currency: chain.displayName,
                    isRealData: true,
                    dataSource: 'Alchemy API',
                };
            }
        } else if (data.error) {
             console.warn(`Alchemy API returned error for ${address} on ${chain.name}: ${data.error.message}`);
        }
      } catch (error: any) {
          console.error(`Alchemy API error for ${address} on ${chain.name}: ${error.message}.`);
      }
    }
  }
  
  // Default return if no balance found through APIs or if API keys are not provided
  console.log(`No positive balance found for ${address} via provided APIs or no keys to check.`);
  return {
    address,
    balance: 0,
    currency: 'N/A',
    isRealData: false, 
    dataSource: (etherscanApiKey || blockcypherApiKey || alchemyApiKey) ? 'N/A' : 'Simulated Fallback', 
  };
}


/**
 * Processes a list of seed phrases: derives addresses and fetches their balances.
 *
 * @param seedPhrases An array of seed phrases.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @param alchemyApiKey (Optional) The Alchemy API key.
 * @returns A Promise that resolves with an array of ProcessedWalletInfo.
 */
export async function processSeedPhrasesAndFetchBalances(
  seedPhrases: string[],
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
): Promise<ProcessedWalletInfo[]> {
  const results: ProcessedWalletInfo[] = [];

  for (const phrase of seedPhrases) {
    let derivedAddress: string | null = null;
    let walletType: string | null = 'Ethereum Virtual Machine'; 
    let cryptoName: string | null = null; 
    let balanceData: AddressBalanceResult | null = null;
    let error: string | null = null;
    let derivationError: string | null = null;

    try {
      const wallet = ethers.Wallet.fromPhrase(phrase);
      derivedAddress = wallet.address;
      console.log(`Derived address: ${derivedAddress} for phrase starting with ${phrase.substring(0, 5)}...`);

      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); // Small delay
      
      balanceData = await fetchAddressBalance(derivedAddress, etherscanApiKey, blockcypherApiKey, alchemyApiKey);

      if (balanceData && balanceData.balance > 0) {
        cryptoName = balanceData.currency; 
      } else {
        cryptoName = balanceData?.currency !== 'N/A' ? balanceData.currency : 'ETH'; 
        if (!balanceData && derivedAddress) {
            balanceData = { address: derivedAddress, balance: 0, currency: cryptoName, isRealData: false, dataSource: 'N/A' };
        } else if (balanceData && balanceData.balance === 0) {
             cryptoName = balanceData.currency;
        }
      }

    } catch (e: any) {
      console.error(`Error processing seed phrase "${phrase.substring(0,5)}...": ${e.message}`);
      if (e.message?.toLowerCase().includes('invalid mnemonic')) {
          derivationError = 'Invalid seed phrase format.';
      } else if (!derivedAddress) {
        derivationError = e.message?.split('(')[0]?.trim() || 'Could not derive address';
      }
      error = derivationError ? `Derivation failed: ${derivationError}` : `Balance fetch failed: ${e.message}`;
      walletType = derivationError ? null : walletType;
      cryptoName = derivationError ? null : cryptoName;
       if (!balanceData && derivedAddress) { 
          balanceData = { address: derivedAddress, balance: 0, currency: 'N/A', isRealData: false, dataSource: 'N/A' };
      }
    }

    results.push({
      seedPhrase: phrase,
      derivedAddress,
      walletType,
      cryptoName: balanceData?.balance > 0 ? balanceData.currency : (cryptoName || 'N/A'),
      balanceData,
      error,
      derivationError,
    });
  }
  
  if (etherscanApiKey || blockcypherApiKey || alchemyApiKey) {
    return results.filter(r => r.balanceData && r.balanceData.balance > 0 && r.balanceData.isRealData);
  }
  // If no API keys, means no real check was possible to find non-zero balance.
  // The original logic implied simulation if no keys, but current filtering for real data means empty if no keys.
  return []; 
}