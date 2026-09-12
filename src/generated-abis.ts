// GENERATED from ../abi/*.json (Blockscout-verified Gnosis deployments). Do not edit by hand.
// Regenerate: python scripts/gen-abis.py

export const marketFactoryAbi = [
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "_market",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "_arbitrator",
    "type": "address"
   },
   {
    "internalType": "contract IRealityETH_v3_0",
    "name": "_realitio",
    "type": "address"
   },
   {
    "internalType": "contract IWrapped1155Factory",
    "name": "_wrapped1155Factory",
    "type": "address"
   },
   {
    "internalType": "contract IConditionalTokens",
    "name": "_conditionalTokens",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "_collateralToken",
    "type": "address"
   },
   {
    "internalType": "contract RealityProxy",
    "name": "_realityProxy",
    "type": "address"
   },
   {
    "internalType": "uint32",
    "name": "_questionTimeout",
    "type": "uint32"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "constructor"
 },
 {
  "inputs": [],
  "name": "ERC1167FailedCreateClone",
  "type": "error"
 },
 {
  "anonymous": false,
  "inputs": [
   {
    "indexed": true,
    "internalType": "address",
    "name": "market",
    "type": "address"
   },
   {
    "indexed": false,
    "internalType": "string",
    "name": "marketName",
    "type": "string"
   },
   {
    "indexed": false,
    "internalType": "address",
    "name": "parentMarket",
    "type": "address"
   },
   {
    "indexed": false,
    "internalType": "bytes32",
    "name": "conditionId",
    "type": "bytes32"
   },
   {
    "indexed": false,
    "internalType": "bytes32",
    "name": "questionId",
    "type": "bytes32"
   },
   {
    "indexed": false,
    "internalType": "bytes32[]",
    "name": "questionsIds",
    "type": "bytes32[]"
   }
  ],
  "name": "NewMarket",
  "type": "event"
 },
 {
  "inputs": [],
  "name": "allMarkets",
  "outputs": [
   {
    "internalType": "address[]",
    "name": "",
    "type": "address[]"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "arbitrator",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "collateralToken",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "conditionalTokens",
  "outputs": [
   {
    "internalType": "contract IConditionalTokens",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "string",
      "name": "marketName",
      "type": "string"
     },
     {
      "internalType": "string[]",
      "name": "outcomes",
      "type": "string[]"
     },
     {
      "internalType": "string",
      "name": "questionStart",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "questionEnd",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "outcomeType",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "parentOutcome",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "parentMarket",
      "type": "address"
     },
     {
      "internalType": "string",
      "name": "category",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "lang",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "lowerBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "upperBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "minBond",
      "type": "uint256"
     },
     {
      "internalType": "uint32",
      "name": "openingTime",
      "type": "uint32"
     },
     {
      "internalType": "string[]",
      "name": "tokenNames",
      "type": "string[]"
     }
    ],
    "internalType": "struct MarketFactory.CreateMarketParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "createCategoricalMarket",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "string",
      "name": "marketName",
      "type": "string"
     },
     {
      "internalType": "string[]",
      "name": "outcomes",
      "type": "string[]"
     },
     {
      "internalType": "string",
      "name": "questionStart",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "questionEnd",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "outcomeType",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "parentOutcome",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "parentMarket",
      "type": "address"
     },
     {
      "internalType": "string",
      "name": "category",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "lang",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "lowerBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "upperBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "minBond",
      "type": "uint256"
     },
     {
      "internalType": "uint32",
      "name": "openingTime",
      "type": "uint32"
     },
     {
      "internalType": "string[]",
      "name": "tokenNames",
      "type": "string[]"
     }
    ],
    "internalType": "struct MarketFactory.CreateMarketParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "createMultiCategoricalMarket",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "string",
      "name": "marketName",
      "type": "string"
     },
     {
      "internalType": "string[]",
      "name": "outcomes",
      "type": "string[]"
     },
     {
      "internalType": "string",
      "name": "questionStart",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "questionEnd",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "outcomeType",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "parentOutcome",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "parentMarket",
      "type": "address"
     },
     {
      "internalType": "string",
      "name": "category",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "lang",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "lowerBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "upperBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "minBond",
      "type": "uint256"
     },
     {
      "internalType": "uint32",
      "name": "openingTime",
      "type": "uint32"
     },
     {
      "internalType": "string[]",
      "name": "tokenNames",
      "type": "string[]"
     }
    ],
    "internalType": "struct MarketFactory.CreateMarketParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "createMultiScalarMarket",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "string",
      "name": "marketName",
      "type": "string"
     },
     {
      "internalType": "string[]",
      "name": "outcomes",
      "type": "string[]"
     },
     {
      "internalType": "string",
      "name": "questionStart",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "questionEnd",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "outcomeType",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "parentOutcome",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "parentMarket",
      "type": "address"
     },
     {
      "internalType": "string",
      "name": "category",
      "type": "string"
     },
     {
      "internalType": "string",
      "name": "lang",
      "type": "string"
     },
     {
      "internalType": "uint256",
      "name": "lowerBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "upperBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "minBond",
      "type": "uint256"
     },
     {
      "internalType": "uint32",
      "name": "openingTime",
      "type": "uint32"
     },
     {
      "internalType": "string[]",
      "name": "tokenNames",
      "type": "string[]"
     }
    ],
    "internalType": "struct MarketFactory.CreateMarketParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "createScalarMarket",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "market",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "marketCount",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "name": "markets",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "questionTimeout",
  "outputs": [
   {
    "internalType": "uint32",
    "name": "",
    "type": "uint32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "realitio",
  "outputs": [
   {
    "internalType": "contract IRealityETH_v3_0",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "realityProxy",
  "outputs": [
   {
    "internalType": "contract RealityProxy",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "wrapped1155Factory",
  "outputs": [
   {
    "internalType": "contract IWrapped1155Factory",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 }
] as const;

export const marketViewAbi = [
 {
  "inputs": [
   {
    "internalType": "contract IMarketFactory",
    "name": "marketFactory",
    "type": "address"
   },
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   }
  ],
  "name": "getMarket",
  "outputs": [
   {
    "components": [
     {
      "internalType": "address",
      "name": "id",
      "type": "address"
     },
     {
      "internalType": "string",
      "name": "marketName",
      "type": "string"
     },
     {
      "internalType": "string[]",
      "name": "outcomes",
      "type": "string[]"
     },
     {
      "components": [
       {
        "internalType": "address",
        "name": "id",
        "type": "address"
       },
       {
        "internalType": "string",
        "name": "marketName",
        "type": "string"
       },
       {
        "internalType": "string[]",
        "name": "outcomes",
        "type": "string[]"
       },
       {
        "internalType": "address[]",
        "name": "wrappedTokens",
        "type": "address[]"
       },
       {
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
       },
       {
        "internalType": "bool",
        "name": "payoutReported",
        "type": "bool"
       },
       {
        "internalType": "uint256[]",
        "name": "payoutNumerators",
        "type": "uint256[]"
       }
      ],
      "internalType": "struct MarketView.ParentMarketInfo",
      "name": "parentMarket",
      "type": "tuple"
     },
     {
      "internalType": "uint256",
      "name": "parentOutcome",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "collateralToken",
      "type": "address"
     },
     {
      "internalType": "address[]",
      "name": "wrappedTokens",
      "type": "address[]"
     },
     {
      "internalType": "uint256",
      "name": "outcomesSupply",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "lowerBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "upperBound",
      "type": "uint256"
     },
     {
      "internalType": "bytes32",
      "name": "parentCollectionId",
      "type": "bytes32"
     },
     {
      "internalType": "address",
      "name": "collateralToken1",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "collateralToken2",
      "type": "address"
     },
     {
      "internalType": "bytes32",
      "name": "conditionId",
      "type": "bytes32"
     },
     {
      "internalType": "bytes32",
      "name": "questionId",
      "type": "bytes32"
     },
     {
      "internalType": "uint256",
      "name": "templateId",
      "type": "uint256"
     },
     {
      "components": [
       {
        "internalType": "bytes32",
        "name": "content_hash",
        "type": "bytes32"
       },
       {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
       },
       {
        "internalType": "uint32",
        "name": "opening_ts",
        "type": "uint32"
       },
       {
        "internalType": "uint32",
        "name": "timeout",
        "type": "uint32"
       },
       {
        "internalType": "uint32",
        "name": "finalize_ts",
        "type": "uint32"
       },
       {
        "internalType": "bool",
        "name": "is_pending_arbitration",
        "type": "bool"
       },
       {
        "internalType": "uint256",
        "name": "bounty",
        "type": "uint256"
       },
       {
        "internalType": "bytes32",
        "name": "best_answer",
        "type": "bytes32"
       },
       {
        "internalType": "bytes32",
        "name": "history_hash",
        "type": "bytes32"
       },
       {
        "internalType": "uint256",
        "name": "bond",
        "type": "uint256"
       },
       {
        "internalType": "uint256",
        "name": "min_bond",
        "type": "uint256"
       }
      ],
      "internalType": "struct IRealityETH_v3_0.Question[]",
      "name": "questions",
      "type": "tuple[]"
     },
     {
      "internalType": "bytes32[]",
      "name": "questionsIds",
      "type": "bytes32[]"
     },
     {
      "internalType": "string[]",
      "name": "encodedQuestions",
      "type": "string[]"
     },
     {
      "internalType": "bool",
      "name": "payoutReported",
      "type": "bool"
     },
     {
      "internalType": "uint256[]",
      "name": "payoutNumerators",
      "type": "uint256[]"
     }
    ],
    "internalType": "struct MarketView.MarketInfo",
    "name": "",
    "type": "tuple"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "count",
    "type": "uint256"
   },
   {
    "internalType": "contract IMarketFactory",
    "name": "marketFactory",
    "type": "address"
   }
  ],
  "name": "getMarkets",
  "outputs": [
   {
    "components": [
     {
      "internalType": "address",
      "name": "id",
      "type": "address"
     },
     {
      "internalType": "string",
      "name": "marketName",
      "type": "string"
     },
     {
      "internalType": "string[]",
      "name": "outcomes",
      "type": "string[]"
     },
     {
      "components": [
       {
        "internalType": "address",
        "name": "id",
        "type": "address"
       },
       {
        "internalType": "string",
        "name": "marketName",
        "type": "string"
       },
       {
        "internalType": "string[]",
        "name": "outcomes",
        "type": "string[]"
       },
       {
        "internalType": "address[]",
        "name": "wrappedTokens",
        "type": "address[]"
       },
       {
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
       },
       {
        "internalType": "bool",
        "name": "payoutReported",
        "type": "bool"
       },
       {
        "internalType": "uint256[]",
        "name": "payoutNumerators",
        "type": "uint256[]"
       }
      ],
      "internalType": "struct MarketView.ParentMarketInfo",
      "name": "parentMarket",
      "type": "tuple"
     },
     {
      "internalType": "uint256",
      "name": "parentOutcome",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "collateralToken",
      "type": "address"
     },
     {
      "internalType": "address[]",
      "name": "wrappedTokens",
      "type": "address[]"
     },
     {
      "internalType": "uint256",
      "name": "outcomesSupply",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "lowerBound",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "upperBound",
      "type": "uint256"
     },
     {
      "internalType": "bytes32",
      "name": "parentCollectionId",
      "type": "bytes32"
     },
     {
      "internalType": "address",
      "name": "collateralToken1",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "collateralToken2",
      "type": "address"
     },
     {
      "internalType": "bytes32",
      "name": "conditionId",
      "type": "bytes32"
     },
     {
      "internalType": "bytes32",
      "name": "questionId",
      "type": "bytes32"
     },
     {
      "internalType": "uint256",
      "name": "templateId",
      "type": "uint256"
     },
     {
      "components": [
       {
        "internalType": "bytes32",
        "name": "content_hash",
        "type": "bytes32"
       },
       {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
       },
       {
        "internalType": "uint32",
        "name": "opening_ts",
        "type": "uint32"
       },
       {
        "internalType": "uint32",
        "name": "timeout",
        "type": "uint32"
       },
       {
        "internalType": "uint32",
        "name": "finalize_ts",
        "type": "uint32"
       },
       {
        "internalType": "bool",
        "name": "is_pending_arbitration",
        "type": "bool"
       },
       {
        "internalType": "uint256",
        "name": "bounty",
        "type": "uint256"
       },
       {
        "internalType": "bytes32",
        "name": "best_answer",
        "type": "bytes32"
       },
       {
        "internalType": "bytes32",
        "name": "history_hash",
        "type": "bytes32"
       },
       {
        "internalType": "uint256",
        "name": "bond",
        "type": "uint256"
       },
       {
        "internalType": "uint256",
        "name": "min_bond",
        "type": "uint256"
       }
      ],
      "internalType": "struct IRealityETH_v3_0.Question[]",
      "name": "questions",
      "type": "tuple[]"
     },
     {
      "internalType": "bytes32[]",
      "name": "questionsIds",
      "type": "bytes32[]"
     },
     {
      "internalType": "string[]",
      "name": "encodedQuestions",
      "type": "string[]"
     },
     {
      "internalType": "bool",
      "name": "payoutReported",
      "type": "bool"
     },
     {
      "internalType": "uint256[]",
      "name": "payoutNumerators",
      "type": "uint256[]"
     }
    ],
    "internalType": "struct MarketView.MarketInfo[]",
    "name": "",
    "type": "tuple[]"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "bytes32",
    "name": "questionId",
    "type": "bytes32"
   },
   {
    "internalType": "contract IRealityETH_v3_0",
    "name": "realitio",
    "type": "address"
   }
  ],
  "name": "getQuestionId",
  "outputs": [
   {
    "internalType": "bytes32",
    "name": "",
    "type": "bytes32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 }
] as const;

export const marketAbi = [
 {
  "inputs": [],
  "name": "conditionId",
  "outputs": [
   {
    "internalType": "bytes32",
    "name": "",
    "type": "bytes32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "conditionalTokensParams",
  "outputs": [
   {
    "internalType": "bytes32",
    "name": "conditionId",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "parentCollectionId",
    "type": "bytes32"
   },
   {
    "internalType": "uint256",
    "name": "parentOutcome",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "parentMarket",
    "type": "address"
   },
   {
    "internalType": "bytes32",
    "name": "questionId",
    "type": "bytes32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "index",
    "type": "uint256"
   }
  ],
  "name": "encodedQuestions",
  "outputs": [
   {
    "internalType": "string",
    "name": "",
    "type": "string"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "string",
    "name": "_marketName",
    "type": "string"
   },
   {
    "internalType": "string[]",
    "name": "_outcomes",
    "type": "string[]"
   },
   {
    "internalType": "uint256",
    "name": "_lowerBound",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "_upperBound",
    "type": "uint256"
   },
   {
    "components": [
     {
      "internalType": "bytes32",
      "name": "conditionId",
      "type": "bytes32"
     },
     {
      "internalType": "bytes32",
      "name": "parentCollectionId",
      "type": "bytes32"
     },
     {
      "internalType": "uint256",
      "name": "parentOutcome",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "parentMarket",
      "type": "address"
     },
     {
      "internalType": "bytes32",
      "name": "questionId",
      "type": "bytes32"
     },
     {
      "internalType": "contract IERC20[]",
      "name": "wrapped1155",
      "type": "address[]"
     },
     {
      "internalType": "bytes[]",
      "name": "data",
      "type": "bytes[]"
     }
    ],
    "internalType": "struct Market.ConditionalTokensParams",
    "name": "_conditionalTokensParams",
    "type": "tuple"
   },
   {
    "components": [
     {
      "internalType": "bytes32[]",
      "name": "questionsIds",
      "type": "bytes32[]"
     },
     {
      "internalType": "uint256",
      "name": "templateId",
      "type": "uint256"
     },
     {
      "internalType": "string[]",
      "name": "encodedQuestions",
      "type": "string[]"
     }
    ],
    "internalType": "struct Market.RealityParams",
    "name": "_realityParams",
    "type": "tuple"
   },
   {
    "internalType": "contract RealityProxy",
    "name": "_realityProxy",
    "type": "address"
   }
  ],
  "name": "initialize",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "initialized",
  "outputs": [
   {
    "internalType": "bool",
    "name": "",
    "type": "bool"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "lowerBound",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "marketName",
  "outputs": [
   {
    "internalType": "string",
    "name": "",
    "type": "string"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "numOutcomes",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "name": "outcomes",
  "outputs": [
   {
    "internalType": "string",
    "name": "",
    "type": "string"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "parentCollectionId",
  "outputs": [
   {
    "internalType": "bytes32",
    "name": "",
    "type": "bytes32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "parentMarket",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "parentOutcome",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "parentWrappedOutcome",
  "outputs": [
   {
    "internalType": "contract IERC20",
    "name": "wrapped1155",
    "type": "address"
   },
   {
    "internalType": "bytes",
    "name": "data",
    "type": "bytes"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "questionId",
  "outputs": [
   {
    "internalType": "bytes32",
    "name": "",
    "type": "bytes32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "questionsIds",
  "outputs": [
   {
    "internalType": "bytes32[]",
    "name": "",
    "type": "bytes32[]"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "realityParams",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "templateId",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "realityProxy",
  "outputs": [
   {
    "internalType": "contract RealityProxy",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "resolve",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "templateId",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "upperBound",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "index",
    "type": "uint256"
   }
  ],
  "name": "wrappedOutcome",
  "outputs": [
   {
    "internalType": "contract IERC20",
    "name": "wrapped1155",
    "type": "address"
   },
   {
    "internalType": "bytes",
    "name": "data",
    "type": "bytes"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 }
] as const;

export const gnosisRouterAbi = [
 {
  "inputs": [
   {
    "internalType": "contract IConditionalTokens",
    "name": "_conditionalTokens",
    "type": "address"
   },
   {
    "internalType": "contract IWrapped1155Factory",
    "name": "_wrapped1155Factory",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "constructor"
 },
 {
  "inputs": [],
  "name": "conditionalTokens",
  "outputs": [
   {
    "internalType": "contract IConditionalTokens",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract IERC20",
    "name": "collateralToken",
    "type": "address"
   },
   {
    "internalType": "bytes32",
    "name": "parentCollectionId",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "conditionId",
    "type": "bytes32"
   },
   {
    "internalType": "uint256",
    "name": "indexSet",
    "type": "uint256"
   }
  ],
  "name": "getTokenId",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "bytes32",
    "name": "conditionId",
    "type": "bytes32"
   }
  ],
  "name": "getWinningOutcomes",
  "outputs": [
   {
    "internalType": "bool[]",
    "name": "",
    "type": "bool[]"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract IERC20",
    "name": "collateralToken",
    "type": "address"
   },
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
   }
  ],
  "name": "mergePositions",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
   }
  ],
  "name": "mergeToBase",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   },
   {
    "internalType": "uint256[]",
    "name": "",
    "type": "uint256[]"
   },
   {
    "internalType": "uint256[]",
    "name": "",
    "type": "uint256[]"
   },
   {
    "internalType": "bytes",
    "name": "",
    "type": "bytes"
   }
  ],
  "name": "onERC1155BatchReceived",
  "outputs": [
   {
    "internalType": "bytes4",
    "name": "",
    "type": "bytes4"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   },
   {
    "internalType": "bytes",
    "name": "",
    "type": "bytes"
   }
  ],
  "name": "onERC1155Received",
  "outputs": [
   {
    "internalType": "bytes4",
    "name": "",
    "type": "bytes4"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract IERC20",
    "name": "collateralToken",
    "type": "address"
   },
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   },
   {
    "internalType": "uint256[]",
    "name": "outcomeIndexes",
    "type": "uint256[]"
   },
   {
    "internalType": "uint256[]",
    "name": "amounts",
    "type": "uint256[]"
   }
  ],
  "name": "redeemPositions",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   },
   {
    "internalType": "uint256[]",
    "name": "outcomeIndexes",
    "type": "uint256[]"
   },
   {
    "internalType": "uint256[]",
    "name": "amounts",
    "type": "uint256[]"
   }
  ],
  "name": "redeemToBase",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "sDAI",
  "outputs": [
   {
    "internalType": "contract IERC20",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "savingsXDaiAdapter",
  "outputs": [
   {
    "internalType": "contract ISavingsXDaiAdapter",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   }
  ],
  "name": "splitFromBase",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract IERC20",
    "name": "collateralToken",
    "type": "address"
   },
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
   }
  ],
  "name": "splitPosition",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "bytes4",
    "name": "interfaceId",
    "type": "bytes4"
   }
  ],
  "name": "supportsInterface",
  "outputs": [
   {
    "internalType": "bool",
    "name": "",
    "type": "bool"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "wrapped1155Factory",
  "outputs": [
   {
    "internalType": "contract IWrapped1155Factory",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 }
] as const;

export const realityProxyAbi = [
 {
  "inputs": [
   {
    "internalType": "contract IConditionalTokens",
    "name": "_conditionalTokens",
    "type": "address"
   },
   {
    "internalType": "contract IRealityETH_v3_0",
    "name": "_realitio",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "constructor"
 },
 {
  "inputs": [],
  "name": "conditionalTokens",
  "outputs": [
   {
    "internalType": "contract IConditionalTokens",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "realitio",
  "outputs": [
   {
    "internalType": "contract IRealityETH_v3_0",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "contract Market",
    "name": "market",
    "type": "address"
   }
  ],
  "name": "resolve",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 }
] as const;

export const swaprNfpmAbi = [
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "_factory",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "_WNativeToken",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "_tokenDescriptor_",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "_poolDeployer",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "constructor"
 },
 {
  "anonymous": false,
  "inputs": [
   {
    "indexed": true,
    "internalType": "address",
    "name": "owner",
    "type": "address"
   },
   {
    "indexed": true,
    "internalType": "address",
    "name": "approved",
    "type": "address"
   },
   {
    "indexed": true,
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "Approval",
  "type": "event"
 },
 {
  "anonymous": false,
  "inputs": [
   {
    "indexed": true,
    "internalType": "address",
    "name": "owner",
    "type": "address"
   },
   {
    "indexed": true,
    "internalType": "address",
    "name": "operator",
    "type": "address"
   },
   {
    "indexed": false,
    "internalType": "bool",
    "name": "approved",
    "type": "bool"
   }
  ],
  "name": "ApprovalForAll",
  "type": "event"
 },
 {
  "anonymous": false,
  "inputs": [
   {
    "indexed": true,
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   },
   {
    "indexed": false,
    "internalType": "address",
    "name": "recipient",
    "type": "address"
   },
   {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
   },
   {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
   }
  ],
  "name": "Collect",
  "type": "event"
 },
 {
  "anonymous": false,
  "inputs": [
   {
    "indexed": true,
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   },
   {
    "indexed": false,
    "internalType": "uint128",
    "name": "liquidity",
    "type": "uint128"
   },
   {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
   },
   {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
   }
  ],
  "name": "DecreaseLiquidity",
  "type": "event"
 },
 {
  "anonymous": false,
  "inputs": [
   {
    "indexed": true,
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   },
   {
    "indexed": false,
    "internalType": "uint128",
    "name": "liquidity",
    "type": "uint128"
   },
   {
    "indexed": false,
    "internalType": "uint128",
    "name": "actualLiquidity",
    "type": "uint128"
   },
   {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
   },
   {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
   },
   {
    "indexed": false,
    "internalType": "address",
    "name": "pool",
    "type": "address"
   }
  ],
  "name": "IncreaseLiquidity",
  "type": "event"
 },
 {
  "anonymous": false,
  "inputs": [
   {
    "indexed": true,
    "internalType": "address",
    "name": "from",
    "type": "address"
   },
   {
    "indexed": true,
    "internalType": "address",
    "name": "to",
    "type": "address"
   },
   {
    "indexed": true,
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "Transfer",
  "type": "event"
 },
 {
  "inputs": [],
  "name": "DOMAIN_SEPARATOR",
  "outputs": [
   {
    "internalType": "bytes32",
    "name": "",
    "type": "bytes32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "PERMIT_TYPEHASH",
  "outputs": [
   {
    "internalType": "bytes32",
    "name": "",
    "type": "bytes32"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "WNativeToken",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "amount0Owed",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "amount1Owed",
    "type": "uint256"
   },
   {
    "internalType": "bytes",
    "name": "data",
    "type": "bytes"
   }
  ],
  "name": "algebraMintCallback",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "to",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "approve",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "owner",
    "type": "address"
   }
  ],
  "name": "balanceOf",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "baseURI",
  "outputs": [
   {
    "internalType": "string",
    "name": "",
    "type": "string"
   }
  ],
  "stateMutability": "pure",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "burn",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "uint256",
      "name": "tokenId",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "recipient",
      "type": "address"
     },
     {
      "internalType": "uint128",
      "name": "amount0Max",
      "type": "uint128"
     },
     {
      "internalType": "uint128",
      "name": "amount1Max",
      "type": "uint128"
     }
    ],
    "internalType": "struct INonfungiblePositionManager.CollectParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "collect",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token0",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "token1",
    "type": "address"
   },
   {
    "internalType": "uint160",
    "name": "sqrtPriceX96",
    "type": "uint160"
   }
  ],
  "name": "createAndInitializePoolIfNecessary",
  "outputs": [
   {
    "internalType": "address",
    "name": "pool",
    "type": "address"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "uint256",
      "name": "tokenId",
      "type": "uint256"
     },
     {
      "internalType": "uint128",
      "name": "liquidity",
      "type": "uint128"
     },
     {
      "internalType": "uint256",
      "name": "amount0Min",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount1Min",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     }
    ],
    "internalType": "struct INonfungiblePositionManager.DecreaseLiquidityParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "decreaseLiquidity",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "factory",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "getApproved",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "uint256",
      "name": "tokenId",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount0Desired",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount1Desired",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount0Min",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount1Min",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     }
    ],
    "internalType": "struct INonfungiblePositionManager.IncreaseLiquidityParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "increaseLiquidity",
  "outputs": [
   {
    "internalType": "uint128",
    "name": "liquidity",
    "type": "uint128"
   },
   {
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "owner",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "operator",
    "type": "address"
   }
  ],
  "name": "isApprovedForAll",
  "outputs": [
   {
    "internalType": "bool",
    "name": "",
    "type": "bool"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "address",
      "name": "token0",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "token1",
      "type": "address"
     },
     {
      "internalType": "int24",
      "name": "tickLower",
      "type": "int24"
     },
     {
      "internalType": "int24",
      "name": "tickUpper",
      "type": "int24"
     },
     {
      "internalType": "uint256",
      "name": "amount0Desired",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount1Desired",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount0Min",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amount1Min",
      "type": "uint256"
     },
     {
      "internalType": "address",
      "name": "recipient",
      "type": "address"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     }
    ],
    "internalType": "struct INonfungiblePositionManager.MintParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "mint",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   },
   {
    "internalType": "uint128",
    "name": "liquidity",
    "type": "uint128"
   },
   {
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "bytes[]",
    "name": "data",
    "type": "bytes[]"
   }
  ],
  "name": "multicall",
  "outputs": [
   {
    "internalType": "bytes[]",
    "name": "results",
    "type": "bytes[]"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "name",
  "outputs": [
   {
    "internalType": "string",
    "name": "",
    "type": "string"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "ownerOf",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "spender",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "deadline",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "permit",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "poolDeployer",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "positions",
  "outputs": [
   {
    "internalType": "uint96",
    "name": "nonce",
    "type": "uint96"
   },
   {
    "internalType": "address",
    "name": "operator",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "token0",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "token1",
    "type": "address"
   },
   {
    "internalType": "int24",
    "name": "tickLower",
    "type": "int24"
   },
   {
    "internalType": "int24",
    "name": "tickUpper",
    "type": "int24"
   },
   {
    "internalType": "uint128",
    "name": "liquidity",
    "type": "uint128"
   },
   {
    "internalType": "uint256",
    "name": "feeGrowthInside0LastX128",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "feeGrowthInside1LastX128",
    "type": "uint256"
   },
   {
    "internalType": "uint128",
    "name": "tokensOwed0",
    "type": "uint128"
   },
   {
    "internalType": "uint128",
    "name": "tokensOwed1",
    "type": "uint128"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "refundNativeToken",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "from",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "to",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "safeTransferFrom",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "from",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "to",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   },
   {
    "internalType": "bytes",
    "name": "_data",
    "type": "bytes"
   }
  ],
  "name": "safeTransferFrom",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "value",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "deadline",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermit",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "nonce",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "expiry",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermitAllowed",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "nonce",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "expiry",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermitAllowedIfNecessary",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "value",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "deadline",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermitIfNecessary",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "operator",
    "type": "address"
   },
   {
    "internalType": "bool",
    "name": "approved",
    "type": "bool"
   }
  ],
  "name": "setApprovalForAll",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "bytes4",
    "name": "interfaceId",
    "type": "bytes4"
   }
  ],
  "name": "supportsInterface",
  "outputs": [
   {
    "internalType": "bool",
    "name": "",
    "type": "bool"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "amountMinimum",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "recipient",
    "type": "address"
   }
  ],
  "name": "sweepToken",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "symbol",
  "outputs": [
   {
    "internalType": "string",
    "name": "",
    "type": "string"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "index",
    "type": "uint256"
   }
  ],
  "name": "tokenByIndex",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "owner",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "index",
    "type": "uint256"
   }
  ],
  "name": "tokenOfOwnerByIndex",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "tokenURI",
  "outputs": [
   {
    "internalType": "string",
    "name": "",
    "type": "string"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "totalSupply",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "from",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "to",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "tokenId",
    "type": "uint256"
   }
  ],
  "name": "transferFrom",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "amountMinimum",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "recipient",
    "type": "address"
   }
  ],
  "name": "unwrapWNativeToken",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "stateMutability": "payable",
  "type": "receive"
 }
] as const;

export const swaprRouterAbi = [
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "_factory",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "_WNativeToken",
    "type": "address"
   },
   {
    "internalType": "address",
    "name": "_poolDeployer",
    "type": "address"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "constructor"
 },
 {
  "inputs": [],
  "name": "WNativeToken",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "int256",
    "name": "amount0Delta",
    "type": "int256"
   },
   {
    "internalType": "int256",
    "name": "amount1Delta",
    "type": "int256"
   },
   {
    "internalType": "bytes",
    "name": "_data",
    "type": "bytes"
   }
  ],
  "name": "algebraSwapCallback",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "bytes",
      "name": "path",
      "type": "bytes"
     },
     {
      "internalType": "address",
      "name": "recipient",
      "type": "address"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountIn",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountOutMinimum",
      "type": "uint256"
     }
    ],
    "internalType": "struct ISwapRouter.ExactInputParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "exactInput",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "amountOut",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "address",
      "name": "tokenIn",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "tokenOut",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "recipient",
      "type": "address"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountIn",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountOutMinimum",
      "type": "uint256"
     },
     {
      "internalType": "uint160",
      "name": "limitSqrtPrice",
      "type": "uint160"
     }
    ],
    "internalType": "struct ISwapRouter.ExactInputSingleParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "exactInputSingle",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "amountOut",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "address",
      "name": "tokenIn",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "tokenOut",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "recipient",
      "type": "address"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountIn",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountOutMinimum",
      "type": "uint256"
     },
     {
      "internalType": "uint160",
      "name": "limitSqrtPrice",
      "type": "uint160"
     }
    ],
    "internalType": "struct ISwapRouter.ExactInputSingleParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "exactInputSingleSupportingFeeOnTransferTokens",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "amountOut",
    "type": "uint256"
   }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "bytes",
      "name": "path",
      "type": "bytes"
     },
     {
      "internalType": "address",
      "name": "recipient",
      "type": "address"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountOut",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountInMaximum",
      "type": "uint256"
     }
    ],
    "internalType": "struct ISwapRouter.ExactOutputParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "exactOutput",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "amountIn",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "components": [
     {
      "internalType": "address",
      "name": "tokenIn",
      "type": "address"
     },
     {
      "internalType": "address",
      "name": "tokenOut",
      "type": "address"
     },
     {
      "internalType": "uint24",
      "name": "fee",
      "type": "uint24"
     },
     {
      "internalType": "address",
      "name": "recipient",
      "type": "address"
     },
     {
      "internalType": "uint256",
      "name": "deadline",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountOut",
      "type": "uint256"
     },
     {
      "internalType": "uint256",
      "name": "amountInMaximum",
      "type": "uint256"
     },
     {
      "internalType": "uint160",
      "name": "limitSqrtPrice",
      "type": "uint160"
     }
    ],
    "internalType": "struct ISwapRouter.ExactOutputSingleParams",
    "name": "params",
    "type": "tuple"
   }
  ],
  "name": "exactOutputSingle",
  "outputs": [
   {
    "internalType": "uint256",
    "name": "amountIn",
    "type": "uint256"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "factory",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "bytes[]",
    "name": "data",
    "type": "bytes[]"
   }
  ],
  "name": "multicall",
  "outputs": [
   {
    "internalType": "bytes[]",
    "name": "results",
    "type": "bytes[]"
   }
  ],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "poolDeployer",
  "outputs": [
   {
    "internalType": "address",
    "name": "",
    "type": "address"
   }
  ],
  "stateMutability": "view",
  "type": "function"
 },
 {
  "inputs": [],
  "name": "refundNativeToken",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "value",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "deadline",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermit",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "nonce",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "expiry",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermitAllowed",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "nonce",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "expiry",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermitAllowedIfNecessary",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "value",
    "type": "uint256"
   },
   {
    "internalType": "uint256",
    "name": "deadline",
    "type": "uint256"
   },
   {
    "internalType": "uint8",
    "name": "v",
    "type": "uint8"
   },
   {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
   },
   {
    "internalType": "bytes32",
    "name": "s",
    "type": "bytes32"
   }
  ],
  "name": "selfPermitIfNecessary",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "amountMinimum",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "recipient",
    "type": "address"
   }
  ],
  "name": "sweepToken",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "address",
    "name": "token",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "amountMinimum",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "recipient",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "feeBips",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "feeRecipient",
    "type": "address"
   }
  ],
  "name": "sweepTokenWithFee",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "amountMinimum",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "recipient",
    "type": "address"
   }
  ],
  "name": "unwrapWNativeToken",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "inputs": [
   {
    "internalType": "uint256",
    "name": "amountMinimum",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "recipient",
    "type": "address"
   },
   {
    "internalType": "uint256",
    "name": "feeBips",
    "type": "uint256"
   },
   {
    "internalType": "address",
    "name": "feeRecipient",
    "type": "address"
   }
  ],
  "name": "unwrapWNativeTokenWithFee",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
 },
 {
  "stateMutability": "payable",
  "type": "receive"
 }
] as const;
