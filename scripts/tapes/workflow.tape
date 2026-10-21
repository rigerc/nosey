# Slow, read-only README demo: Scan (skills) -> Registries only.
# The runner launches Scan, waits for it, and captures the initial PNG.
# Deliberate holds let viewers read the detected skills before navigating.
Wait+Screen@15s /Scan complete/
Sleep 2s
Type "/"
Sleep 600ms
Type@180ms "react"
Sleep 500ms
Enter
Wait+Screen@10s /Filter: react/
Sleep 3s
Type "c"
Sleep 2s
Type "2"
Wait+Screen@10s /Registry references/
Sleep 5s
# Never open Settings or Help; never confirm a skill or write to a registry.
