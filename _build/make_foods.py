"""Build ../foods.js from the USDA SR Legacy CSV dataset.

Usage: python3 make_foods.py <path to FoodData_Central_sr_legacy_food_csv_2018-04>
Each entry: app name, exact USDA description prefix, and which USDA portion to use as "1 piece/unit"
(substring of the portion's description/modifier), or None for grams only.
"""
import csv, json, sys, os

SRC = sys.argv[1]

FOODS = [
    # (name in app, USDA description startswith, portion match, portion label)
    ("Egg (whole, raw/boiled)", "Egg, whole, raw, fresh", "large", "large egg"),
    ("Egg, fried", "Egg, whole, cooked, fried", "large", "large egg"),
    ("Egg white", "Egg, white, raw, fresh", "large", "egg white"),
    ("Chicken breast, raw", "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw", None, None),
    ("Chicken breast, cooked", "Chicken, broilers or fryers, breast, meat only, cooked, roasted", None, None),
    ("Turkey breast, raw", "Turkey, whole, breast, meat only, raw", None, None),
    ("Pork loin, lean, raw", "Pork, fresh, loin, whole, separable lean only, raw", None, None),
    ("Ground beef 80/20, raw", "Beef, ground, 80% lean meat / 20% fat, raw", None, None),
    ("Ham, sliced", "Ham, sliced, regular", "slice", "slice"),
    ("Salmon, raw", "Fish, salmon, Atlantic, farmed, raw", None, None),
    ("Tuna in water, drained", "Fish, tuna, light, canned in water, drained solids (", None, None),
    ("Rice, white, cooked", "Rice, white, long-grain, regular, enriched, cooked", None, None),
    ("Rice, white, dry", "Rice, white, long-grain, regular, raw, enriched", None, None),
    ("Pasta, cooked", "Pasta, cooked, enriched, without added salt", None, None),
    ("Pasta, dry", "Pasta, dry, enriched", None, None),
    ("Oats, dry", "Cereals, oats, regular and quick, not fortified, dry", None, None),
    ("Bread, white", "Bread, white, commercially prepared (includes", "slice", "slice"),
    ("Bread, whole-wheat", "Bread, whole-wheat, commercially prepared", "slice", "slice"),
    ("Potatoes, boiled", "Potatoes, boiled, cooked without skin", None, None),
    ("Lentils, cooked", "Lentils, mature seeds, cooked, boiled, without salt", None, None),
    ("Chickpeas, cooked", "Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt", None, None),
    ("Milk, whole 3.25%", "Milk, whole, 3.25% milkfat, with added vitamin D", "cup", "cup (244 ml)"),
    ("Milk, 2%", "Milk, reduced fat, fluid, 2% milkfat, with added", "cup", "cup (244 ml)"),
    ("Yogurt, plain, whole milk", "Yogurt, plain, whole milk", None, None),
    ("Greek yogurt, plain, 0%", "Yogurt, Greek, plain, nonfat", None, None),
    ("Cottage cheese 2%", "Cheese, cottage, lowfat, 2% milkfat", None, None),
    ("Cheese, cheddar", "Cheese, cheddar (Includes", "slice", "slice"),
    ("Cheese, feta (like telemea)", "Cheese, feta", None, None),
    ("Cheese, mozzarella", "Cheese, mozzarella, whole milk", None, None),
    ("Sour cream", "Cream, sour, cultured", "tbsp", "tbsp"),
    ("Butter", "Butter, salted", "tbsp", "tbsp"),
    ("Olive oil", "Oil, olive, salad or cooking", "tablespoon", "tbsp"),
    ("Peanut butter", "Peanut butter, smooth style, without salt", "tbsp", "tbsp"),
    ("Almonds", "Nuts, almonds", None, None),
    ("Avocado", "Avocados, raw, all commercial varieties", None, None),
    ("Banana", "Bananas, raw", "medium", "medium banana"),
    ("Apple", "Apples, raw, with skin", "medium", "medium apple"),
    ("Orange", "Oranges, raw, all commercial varieties", "large", "orange"),
    ("Strawberries", "Strawberries, raw", None, None),
    ("Tomato", "Tomatoes, red, ripe, raw, year round average", "medium", "medium tomato"),
    ("Cucumber", "Cucumber, with peel, raw", None, None),
    ("Bell pepper, red", "Peppers, sweet, red, raw", "medium", "medium pepper"),
    ("Onion", "Onions, raw", "medium", "medium onion"),
    ("Carrot", "Carrots, raw", "medium", "medium carrot"),
    ("Broccoli", "Broccoli, raw", None, None),
    ("Sugar", "Sugars, granulated", "tsp", "tsp"),
    ("Honey", "Honey", "tbsp", "tbsp"),
    ("Cola, regular", "Beverages, carbonated, cola, regular", None, None),
    ("Beer, regular", "Alcoholic beverage, beer, regular, all", None, None),
    ("Wine, red", "Alcoholic beverage, wine, table, red", None, None),
]

NUT = {"1008": "kcal", "1003": "p", "1005": "c", "1004": "f"}

foods = {}
with open(os.path.join(SRC, "food.csv"), newline="") as fh:
    for r in csv.DictReader(fh):
        foods.setdefault(r["description"], r["fdc_id"])

def find(prefix):
    if prefix in foods:
        return prefix, foods[prefix]
    hits = sorted(d for d in foods if d.startswith(prefix))
    if not hits:
        sys.exit(f"NOT FOUND: {prefix}")
    return hits[0], foods[hits[0]]

picked = []
for name, prefix, pm, plabel in FOODS:
    desc, fid = find(prefix)
    picked.append((name, desc, fid, pm, plabel))
ids = {p[2] for p in picked}

nut = {i: {} for i in ids}
with open(os.path.join(SRC, "food_nutrient.csv"), newline="") as fh:
    for r in csv.DictReader(fh):
        if r["fdc_id"] in ids and r["nutrient_id"] in NUT:
            nut[r["fdc_id"]][NUT[r["nutrient_id"]]] = round(float(r["amount"]), 1)

portions = {i: [] for i in ids}
with open(os.path.join(SRC, "food_portion.csv"), newline="") as fh:
    for r in csv.DictReader(fh):
        if r["fdc_id"] in ids:
            portions[r["fdc_id"]].append((f'{r["amount"]} {r["portion_description"]} {r["modifier"]}'.strip(), float(r["gram_weight"])))

out = []
for name, desc, fid, pm, plabel in picked:
    n = nut[fid]
    item = {"name": name, "usda": desc, "fdc": int(fid), "per100": {k: n.get(k, 0) for k in ("kcal", "p", "c", "f")}}
    if pm:
        match = [(d, g / float(d.split()[0])) for d, g in portions[fid] if pm in d.lower()]
        if not match:
            print(f"!! no portion '{pm}' for {name}: {portions[fid]}", file=sys.stderr)
        else:
            item["unit"] = {"label": plabel, "g": round(match[0][1], 1)}
            print(f"{name}: 1 {plabel} = {match[0][1]} g  ({match[0][0]})", file=sys.stderr)
    out.append(item)
    print(f"{name:32s} <- {desc}  {item['per100']}", file=sys.stderr)

dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "foods.js")
with open(dest, "w") as fh:
    fh.write("// Generated by _build/make_foods.py from USDA FoodData Central, SR Legacy (April 2018). Values per 100 g.\n")
    fh.write("window.BUILTIN_FOODS = " + json.dumps(out, indent=1, ensure_ascii=False) + ";\n")
print(f"wrote {len(out)} foods", file=sys.stderr)
