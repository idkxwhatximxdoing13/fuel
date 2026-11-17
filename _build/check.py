"""Consistency check for Fuel (run before every release):  python3 _build/check.py

Catches the kind of mistake a redesign makes easily:
  - app.js looks up an id that no longer exists in index.html (or in a sheet's own markup)
  - markup uses a CSS class that style.css doesn't style
  - sw.js doesn't list a file the app needs offline, or the two version stamps differ
Exit code 1 if anything is wrong.
"""
import os
import re
import sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
read = lambda name: open(os.path.join(root, name), encoding="utf-8").read()
js, html, css, sw = read("app.js"), read("index.html"), read("style.css"), read("sw.js")
problems = []

# --- ids: every $("#id") / $("#id", scope) lookup must exist in index.html or in markup that app.js builds
defined = set(re.findall(r'\bid="([\w-]+)"', html)) | set(re.findall(r'\bid="([\w-]+)"', js))
used = set(re.findall(r'\$\$?\(\s*[`"\']#([\w-]+)["\' ,`]', js)) | set(re.findall(r'closest\(\s*"#([\w-]+)"', js))  # "#tab-" + name (built at run time) is skipped
for i in sorted(used - defined):
    if not i.endswith("-"):  # "#tab-" + name is completed at run time
        problems.append(f"app.js looks up #{i}, but no element has that id")

# --- classes used in markup (index.html + template strings in app.js) must have a rule in style.css
css_classes = set(re.findall(r"\.([a-zA-Z_][\w-]*)", re.sub(r"url\([^)]*\)", "", css)))
used_classes = set()
for src in (html, js):
    for m in re.finditer(r'class="([^"]*)"', src):
        value = re.sub(r"\$\{[^}]*\}", " ", m.group(1))  # drop complete ${...} parts of template strings
        value = value.split("${")[0]                      # ...and anything after one the regex cut short at a quote
        used_classes.update(c for c in value.split() if re.fullmatch(r"[a-zA-Z_][\w-]*", c))
# class names that only appear as quoted words inside ${...}: " cur", ' class="on"', "good" : "bad" and so on
for m in re.finditer(r"""class=\\?["']([a-zA-Z][\w -]*)\\?["']""", js):
    used_classes.update(m.group(1).split())
for m in re.finditer(r'\? "\s?([a-z][\w-]*)" : "\s?([a-z][\w-]*)?"', js):
    if "class" in js[max(0, m.start() - 120):m.start()]:
        used_classes.update(c for c in m.groups() if c)
# classes switched from JS: classList.add/remove take class names; classList.toggle takes one name, then a condition
for m in re.finditer(r'classList\.(add|remove|toggle)\(([^)]*)\)', js):
    names = re.findall(r'"([a-zA-Z_][\w-]*)"', m.group(2))
    used_classes.update(names[:1] if m.group(1) == "toggle" else names)
state_only = {"lock"}  # set on <html>, styled as html.lock
for c in sorted(used_classes - css_classes - state_only):
    problems.append(f"class '{c}' is used in the markup but style.css has no rule for it")

# --- service worker: lists every file the page loads, and the two version stamps match
shell = set(re.findall(r'"([\w./-]+\.(?:html|css|js|png|woff2|webmanifest))"', sw))
needed = set(re.findall(r'(?:src|href)="([\w./-]+\.(?:css|js|png|woff2|webmanifest))"', html)) | {"index.html"}
needed |= set(re.findall(r"url\((fonts/[\w.-]+\.woff2)\)", css))
for f in sorted(needed - shell):
    problems.append(f"sw.js does not keep '{f}' for offline use")
for f in sorted(shell):
    if not os.path.exists(os.path.join(root, f)):
        problems.append(f"sw.js lists '{f}', which does not exist")
v_sw = re.search(r'^const VERSION = "([^"]*)";', sw, re.M)
v_app = re.search(r'^const APP_VERSION = "([^"]*)";', js, re.M)
if not v_sw or not v_app:
    problems.append("version stamp line missing in sw.js or app.js")
elif v_sw.group(1) != v_app.group(1):
    problems.append(f"versions differ: sw.js {v_sw.group(1)} vs app.js {v_app.group(1)}")

if problems:
    print("\n".join("PROBLEM: " + p for p in problems))
    sys.exit(1)
print(f"ok: {len(used)} id lookups, {len(used_classes)} classes, {len(shell)} offline files, version {v_sw.group(1)}")
