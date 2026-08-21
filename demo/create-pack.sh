#!/usr/bin/env bash
# Create an ignored customer-demo pack without putting customer names, assets,
# scenarios, or recordings in the public repository.
set -euo pipefail

cd "$(dirname "$0")/.."

id="${1:-}"
visibility="${2:-private}"
[[ "$id" =~ ^[a-z0-9-]{1,64}$ ]] || {
  echo "usage: demo/create-pack.sh <lowercase-id> [public|private]"
  exit 2
}
[[ "$visibility" == "public" || "$visibility" == "private" ]] || {
  echo "visibility must be public or private"
  exit 2
}

dir=".autofactory/packs/$id"
[[ ! -e "$dir" ]] || { echo "$dir already exists"; exit 1; }
mkdir -p "$dir/events" "$dir/recordings" "$dir/assets"

jq -n --arg id "$id" --arg visibility "$visibility" \
  '{id:$id,name:($id | split("-") | map(ascii_upcase[0:1] + .[1:]) | join(" ")),
    visibility:$visibility,repository:null,scenarios:[]}' \
  >"$dir/pack.json"

# A starting storefront. Fill in the words, colours, and catalog and the store
# takes on the customer's look with no code in the public repo; delete the file
# to keep the built-in DarkCommerce storefront.
jq -n --arg id "$id" \
  '{brand:{name:($id | ascii_upcase), logo:"logo.png"},
    theme:{page:"#f4f4f4",surface:"#ffffff",shell:"#f0f0f0",ink:"#111111",
           muted:"#555555",hairline:"#d5d5d5",accent:"#111111",accentInk:"#ffffff",
           accentWash:"#e8e8e8",accentText:"#444444",headerBg:"#111111",
           headerInk:"#ffffff",topBarBg:"#292929",
           fontFamily:"Arial, Helvetica, sans-serif"},
    header:{topLinks:[],utilityLinks:["Sign In"],nav:[],
            searchPlaceholder:"Search"},
    hero:{image:"hero.jpg",eyebrow:"",headline:"",searchPlaceholder:"Search",cta:"SEARCH"},
    featured:{eyebrow:"",title:"Featured",cta:null},
    categories:{title:"Shop by category",items:[]},
    highlights:[],productCta:"ADD TO CART",priceNote:null,
    catalog:[{id:"sku-1",sku:"SKU-1",name:"Example item",description:"",
              basePrice:19.99,category:"general",emoji:"📦",inventory:10,
              image:"item.png"}]}' \
  >"$dir/storefront.json"

cat >"$dir/README.md" <<EOF
# $id demo pack

This directory is ignored by git. Put customer-specific event payloads in
\`events/<scenario>.json\`, recorded NDJSON runs in \`recordings/\`, and local
assets in \`assets/\`. Keep customer code on local branches or in a private fork.

\`storefront.json\` makes the store look like the customer's: brand, palette,
header, hero, categories, and catalog are all data. Image fields name a file in
\`assets/\` and are served from there, so no customer artwork is ever copied into
\`public/\`. Delete the file to fall back to the built-in storefront.

For the Guided Run, add \`demo.problem\`, \`demo.goal\`, and \`demo.payoff\` to
each event payload. These become the presenter hook, intended proof, and closing
business outcome.

Visibility is \`$visibility\`. Hosted runs for private packs fail closed unless
GitHub confirms the current repository is private.
EOF

echo "created $dir"
echo "edit $dir/storefront.json, drop artwork in $dir/assets, then select the"
echo "pack from Settings in the TUI or the pack selector on the page"
