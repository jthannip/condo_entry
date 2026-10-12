# Setup guide

Installs Condo Entry on one Windows PC (lobby panel + server) and one phone (suite), then verifies each part. Allow about 30 minutes.

## What you need

- A Windows PC with **Docker Desktop** installed and running (macOS works the same way)
- **Zoiper** on the PC (free version) and on a phone (Zoiper Lite)
- The PC and the phone on the **same Wi-Fi network**

## 1. Get the project

```bash
git clone <this repo>
cd condo-entry
```

## 2. Find the PC's IP address

Run `ipconfig` and find the section named **Wireless LAN adapter Wi-Fi** (or **Ethernet adapter Ethernet** if the PC is wired). Note its **IPv4 Address**, for example `10.0.0.151`.

> Ignore adapters named VirtualBox, vEthernet, WSL or Host-Only. They are virtual networks the phone cannot reach. A `192.168.56.x` address is almost always VirtualBox.

## 3. Put the IP in the config

Open `config/pjsip.conf` and set both lines in the `[transport-udp]` section:

```ini
external_media_address=10.0.0.151
external_signaling_address=10.0.0.151
```

Do **not** add `local_net` lines. With Docker Desktop they make Asterisk give phones the container's internal address, and calls connect with no audio.

## 4. Start the system

```bash
docker compose up -d --build
docker ps
```

You should see two containers, `asterisk` and `api`. Under PORTS, look for `0.0.0.0:5061->5060/udp`.

> SIP normally uses port 5060. This project uses **5061** on the PC because another program on the build PC already owned 5060. If `docker compose up` says *"ports are not available"*, see [Troubleshooting → T1](troubleshooting.md#t1-docker-compose-up-fails-with-ports-are-not-available).

## 5. Allow the phone through Windows Firewall

Open PowerShell **as Administrator**:

```powershell
New-NetFirewallRule -DisplayName "Asterisk SIP" -Direction Inbound -Protocol UDP -LocalPort 5061,10000-10100 -Action Allow
```

## 6. Register the lobby panel (PC)

In Zoiper on the PC, add a SIP account:

| Field | Value |
|---|---|
| Username / address | `100@127.0.0.1:5061` |
| Password | `LobbyPass100` |
| Auth username | `100` (or blank) |
| Outbound proxy | blank |
| Transport | SIP UDP |

Expected: green check.

## 7. Register the suite (phone)

In Zoiper on the phone, add a SIP account manually (skip "create account"):

| Field | Value |
|---|---|
| Account name | `Suite 101` (any label) |
| Domain | `<PC IP>:5061`, e.g. `10.0.0.151:5061` |
| User name | `101`, the number **only** |
| Password | `SuitePass101` |
| Caller ID | blank |

On iPhone, allow **Local Network** and **Microphone** access when asked.

Expected: green check.

## 8. Verify

Work down the list. If a step fails, the troubleshooting guide has the fix.

| # | Test | Expected |
|---|---|---|
| 1 | Open `http://localhost:3000` | Dashboard loads; Backend API and Asterisk PBX checks are green |
| 2 | Look at **Devices** | Lobby Panel and Suite 101 are green |
| 3 | From the PC, dial `600` | You hear your own voice (echo test) |
| 4 | From the PC, dial `101` | The phone rings; two-way audio |
| 5 | During the call, press **9** on the phone | Beep; dashboard shows **UNLOCKED**, then **LOCKED** after 5 s |
| 6 | Hang up | Access log shows *Call answered* and *Door unlocked* |
| 7 | Call `101` and don't answer | After 30 s, the log shows *Missed call* |
| 8 | Click **Unlock door** on the dashboard | Door unlocks; log shows *Unlocked from dashboard* |

## Useful commands

```bash
docker compose logs -f api                     # live backend events
docker exec -it asterisk asterisk -rvvv        # Asterisk console
```

In the Asterisk console:

```
pjsip show endpoints        # which phones are registered
pjsip set logger on         # print every SIP message (off: pjsip set logger off)
rtp set debug on            # print audio packets (off: rtp set debug off)
dialplan reload             # after editing extensions.conf
pjsip reload                # after editing pjsip.conf
```
