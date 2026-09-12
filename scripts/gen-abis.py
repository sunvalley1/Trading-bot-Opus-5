import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
names = {"MarketFactory":"marketFactoryAbi","MarketView":"marketViewAbi","Market":"marketAbi","GnosisRouter":"gnosisRouterAbi","RealityProxy":"realityProxyAbi","SwaprNFPM":"swaprNfpmAbi","SwaprRouter":"swaprRouterAbi"}
out = ["// GENERATED from ../abi/*.json (Blockscout-verified Gnosis deployments). Do not edit by hand.", "// Regenerate: python scripts/gen-abis.py", ""]
for f, v in names.items():
    abi = json.load(open(root/"abi"/f"{f}.json"))
    out.append(f"export const {v} = {json.dumps(abi, indent=1)} as const;\n")
(root/"src"/"generated-abis.ts").write_text("\n".join(out))
print("ok")
