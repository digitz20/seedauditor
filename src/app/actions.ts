// @ts-nocheck
'use server';

import { ethers } from 'ethers';

/**
 * Represents the balance data fetched for a specific address and currency.
 */
export interface AddressBalanceResult {
  address: string;
  balance: number;
  currency: string; // e.g., ETH, BTC, MATIC, ETH (Arbitrum)
  isRealData: boolean; // True if fetched from a real API, false if simulated
  dataSource: 'Etherscan API' | 'BlockCypher API' | 'Alchemy API' | 'Blockstream API' | 'Simulated Fallback' | 'N/A' | 'Unknown'; // To indicate source
}

/**
 * Represents the processed data for a single seed phrase, including derived address and all found balances.
 */
export interface ProcessedWalletInfo {
  seedPhrase: string;
  derivedAddress: string | null;
  walletType: string | null; // e.g., 'Ethereum Virtual Machine'
  balanceData: AddressBalanceResult[] | null; // Array of balances
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
 * Fetches all positive balances for a given address from supported APIs.
 * Tries Etherscan (ETH), then BlockCypher (multiple cryptos), then Alchemy (multiple EVM chains), then Blockstream (BTC).
 *
 * @param address The Ethereum address to fetch the balance for.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @param alchemyApiKey (Optional) The Alchemy API key.
 * @param blockstreamApiKey (Optional) The Blockstream API key (Note: Blockstream public API usually doesn't require a key).
 * @returns A Promise that resolves with an array of AddressBalanceResult for all positive balances found.
 */
export async function fetchAddressBalance(
  address: string,
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
  blockstreamApiKey?: string, // Added blockstreamApiKey parameter
): Promise<AddressBalanceResult[]> {
  const allFoundBalances: AddressBalanceResult[] = [];
  console.log(`Fetching all balances for address: ${address}. Etherscan: ${!!etherscanApiKey}, BlockCypher: ${!!blockcypherApiKey}, Alchemy: ${!!alchemyApiKey}, Blockstream: ${!!blockstreamApiKey}`);

  if (!ethers.isAddress(address)) {
    console.warn(`Address ${address} is not a valid Ethereum checksum address. Proceeding with balance checks, but this might fail for ETH-specific APIs. Bitcoin checks with Blockstream API may also be inaccurate if the address is not a valid Bitcoin address.`);
  }

  // Try Etherscan API (ETH mainnet only)
  if (etherscanApiKey) {
    try {
      const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
      const balanceBigInt = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balanceBigInt);
      const balance = parseFloat(balanceEth);
      console.log(`Balance for ${address} from Etherscan: ${balanceEth} ETH`);
      if (balance > 0) {
        allFoundBalances.push({
          address,
          balance,
          currency: 'ETH',
          isRealData: true,
          dataSource: 'Etherscan API',
        });
      }
    } catch (error: any) {
      console.error(`Etherscan API error for ${address}: ${error.message}.`);
    }
  }

  // Try BlockCypher API for multiple coins
  if (blockcypherApiKey) {
    for (const coin of BLOCKCYPHER_COINS_ACTIONS) {
      try {
        // Note: BlockCypher for BTC using an EVM address might not be accurate for typical BTC wallets.
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
          const decimals = (coin.toLowerCase() === 'eth') ? 18 : 8; // Common decimals for BTC, LTC, DOGE, DASH on BlockCypher
          balanceCoin = parseFloat(ethers.formatUnits(balanceInSmallestUnit, decimals));
        }

        console.log(`Balance for ${address} from BlockCypher (${coin.toUpperCase()}): ${balanceCoin} ${coin.toUpperCase()}`);
        if (balanceCoin > 0) {
          allFoundBalances.push({
            address,
            balance: balanceCoin,
            currency: coin.toUpperCase(),
            isRealData: true,
            dataSource: 'BlockCypher API',
          });
        }
      } catch (error: any) {
        console.error(`BlockCypher API error for ${address} (${coin.toUpperCase()}): ${error.message}.`);
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
            id: Date.now() + Math.random(), // Unique ID
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
            const balanceNative = ethers.formatUnits(BigInt(data.result), 18); // Assuming 18 decimals for EVM native
            const balance = parseFloat(balanceNative);
            console.log(`Balance for ${address} from Alchemy on ${chain.name}: ${balanceNative} ${chain.displayName}`);
            if (balance > 0) {
                allFoundBalances.push({
                    address,
                    balance: balance,
                    currency: chain.displayName,
                    isRealData: true,
                    dataSource: 'Alchemy API',
                });
            }
        } else if (data.error) {
             console.warn(`Alchemy API returned error for ${address} on ${chain.name}: ${data.error.message}`);
        }
      } catch (error: any) {
          console.error(`Alchemy API error for ${address} on ${chain.name}: ${error.message}.`);
      }
    }
  }

  // Try Blockstream API (BTC mainnet only)
  // Note: Blockstream API does not typically require an API key for this endpoint.
  // Using an EVM-derived address to check BTC balance here has limitations and might not reflect actual BTC wallet balance from the seed.
  if (blockstreamApiKey !== undefined) { // Check if the parameter was passed, even if the key itself isn't used for this public API
    try {
      const response = await fetch(`https://blockstream.info/api/address/${address}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown Blockstream error");
        // Blockstream returns plain text "Invalid Bitcoin address" for invalid addresses
        if (response.status === 400 && errorText.toLowerCase().includes("invalid bitcoin address")) {
          console.warn(`Blockstream API: Address ${address} is not a valid Bitcoin address.`);
        } else {
          console.warn(`Blockstream API error for ${address}: ${response.status} ${response.statusText} - ${errorText}`);
        }
      } else {
        const data = await response.json();
        const fundedSatoshis = BigInt(data.chain_stats?.funded_txo_sum || 0);
        const spentSatoshis = BigInt(data.chain_stats?.spent_txo_sum || 0);
        const balanceSatoshis = fundedSatoshis - spentSatoshis;
        
        let balanceBtc = 0;
        if (balanceSatoshis > 0) {
          balanceBtc = parseFloat(ethers.formatUnits(balanceSatoshis, 8)); // BTC has 8 decimal places
        }
        console.log(`Balance for ${address} from Blockstream: ${balanceBtc} BTC`);
        if (balanceBtc > 0) {
          allFoundBalances.push({
            address,
            balance: balanceBtc,
            currency: 'BTC',
            isRealData: true,
            dataSource: 'Blockstream API',
          });
        }
      }
    } catch (error: any) {
      console.error(`Blockstream API error for ${address}: ${error.message}.`);
    }
  }
  
  if (allFoundBalances.length === 0) {
      console.log(`No positive balances found for ${address} via provided APIs or no keys to check.`);
      if (!etherscanApiKey && !blockcypherApiKey && !alchemyApiKey && blockstreamApiKey === undefined) {
        allFoundBalances.push({
            address,
            balance: 0,
            currency: 'N/A',
            isRealData: false, 
            dataSource: 'Simulated Fallback',
        });
      }
  }
  return allFoundBalances;
}


/**
 * Processes a list of seed phrases: derives addresses and fetches all their positive balances.
 *
 * @param seedPhrases An array of seed phrases.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @param alchemyApiKey (Optional) The Alchemy API key.
 * @param blockstreamApiKey (Optional) The Blockstream API key (informational, public API usually doesn't need one).
 * @returns A Promise that resolves with an array of ProcessedWalletInfo, filtered for those with real positive balances.
 */
export async function processSeedPhrasesAndFetchBalances(
  seedPhrases: string[],
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
  blockstreamApiKey?: string,
): Promise<ProcessedWalletInfo[]> {
  const results: ProcessedWalletInfo[] = [];

  for (const phrase of seedPhrases) {
    let derivedAddress: string | null = null;
    let walletType: string | null = 'Ethereum Virtual Machine'; // Defaulting to EVM as that's what ethers.js primarily derives
    let fetchedBalances: AddressBalanceResult[] = [];
    let error: string | null = null;
    let derivationError: string | null = null;

    try {
      const wallet = ethers.Wallet.fromPhrase(phrase);
      derivedAddress = wallet.address;
      console.log(`Derived EVM address: ${derivedAddress} for phrase starting with ${phrase.substring(0, 5)}...`);

      // Small delay to avoid overwhelming APIs if processing many phrases sequentially
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); 
      
      fetchedBalances = await fetchAddressBalance(
        derivedAddress, 
        etherscanApiKey, 
        blockcypherApiKey, 
        alchemyApiKey,
        blockstreamApiKey 
      );

    } catch (e: any) {
      console.error(`Error processing seed phrase "${phrase.substring(0,5)}...": ${e.message}`);
      if (e.message?.toLowerCase().includes('invalid mnemonic')) {
          derivationError = 'Invalid seed phrase format.';
      } else if (!derivedAddress) {
        derivationError = e.message?.split('(')[0]?.trim() || 'Could not derive address';
      }
      error = derivationError ? `Derivation failed: ${derivationError}` : `Balance fetch failed: ${e.message}`;
      walletType = derivationError ? null : walletType;
       if (derivedAddress && fetchedBalances.length === 0 && !derivationError) { 
             fetchedBalances.push({ address: derivedAddress, balance: 0, currency: 'N/A', isRealData: false, dataSource: 'N/A' });
        }
    }

    results.push({
      seedPhrase: phrase,
      derivedAddress,
      walletType,
      balanceData: fetchedBalances, 
      error,
      derivationError,
    });
  }
  
  if (etherscanApiKey || blockcypherApiKey || alchemyApiKey || blockstreamApiKey !== undefined) {
    return results.filter(r =>
      r.balanceData &&
      r.balanceData.length > 0 &&
      r.balanceData.some(bal => bal.balance > 0 && bal.isRealData)
    );
  }
  return [];
}

    