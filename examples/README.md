# Example LaunchAgents

Two ready-to-adapt agents that pair with the LaunchAgents widget. They are
templates — you must point them at your own home path before installing.

| Agent | What it does | Schedule |
|-------|--------------|----------|
| `com.example.brew-autoupdate` | `brew update` + `upgrade --greedy` + `cleanup` (waits for network first) | Daily 08:00 |
| `com.example.trash-screenshots` | Moves `Screenshot*.png` older than 7 days from `~/Downloads` to the Trash | Daily 09:00 |

## Install one

1. Copy the script into your `~/.local/bin` (create it if needed) and make it
   executable:

   ```bash
   mkdir -p ~/.local/bin
   cp examples/bin/brew-autoupdate.sh ~/.local/bin/
   chmod +x ~/.local/bin/brew-autoupdate.sh
   ```

2. Edit the matching plist and replace every `/Users/USERNAME` with your home
   path (`echo $HOME`), then copy it into `~/Library/LaunchAgents/`:

   ```bash
   cp examples/launchagents/com.example.brew-autoupdate.plist ~/Library/LaunchAgents/
   # edit the copy to set your path, then:
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.brew-autoupdate.plist
   ```

3. The LaunchAgents widget will now show it, with Run/Log buttons and its
   schedule.

## Notes

- `trash-screenshots` touches `~/Downloads`, a TCC-protected folder, so
  `/bin/bash` needs **Full Disk Access** (System Settings → Privacy & Security
  → Full Disk Access) for the scheduled run to succeed.
- Each script writes its exit code to `~/Library/Logs/<label>.exit` so the
  widget's status dot stays accurate across reboots.
