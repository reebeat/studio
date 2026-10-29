#!/usr/bin/env bash
# checkShellDom.sh < dom.html
#
# Reads the serialised DOM of the editor page on stdin and succeeds only when it is the shell of spec 0000: the heading
# "reebeat studio" and the four named regions (Story graph, Preview, Timeline, Inspector). Spec 0004, F1.
set -euo pipefail

dom=$(cat)

grep -q '<h1[^>]*>reebeat studio</h1>' <<<"$dom" || { echo "no heading 'reebeat studio'"; exit 1; }

for region in "Story graph" "Preview" "Timeline" "Inspector"; do
  grep -q "aria-label=\"$region\"" <<<"$dom" || { echo "no region '$region'"; exit 1; }
done

echo "the editor shell: heading and four regions present"
