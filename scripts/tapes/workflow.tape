# The runner starts the selected screen and takes its initial PNG first.
# Keep Output, Set and launch commands in the runner. Edit this journey freely.
# Navigate to Scan regardless of the selected starting screen.
Type "1"
Wait+Screen@15s /Scan complete/
Sleep 1s
Type "/"
Sleep 300ms
Type@100ms "react"
Enter
Wait+Screen@10s /Filter: react/
Sleep 1s
Type "c"
Sleep 500ms
Type "2"
Wait+Screen@10s /Registry references/
Sleep 1s
Type "3"
Wait+Screen@10s /Review and configure application preferences/
Sleep 1s
Ctrl+K
Sleep 300ms
Type@100ms "help"
Sleep 300ms
Enter
Wait+Screen@10s /Scanning and selecting never installs skills/
Sleep 1s
# No registry writes, saved settings, skill confirmation or installations.
