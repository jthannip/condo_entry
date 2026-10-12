# Troubleshooting guide

Written for installers. Find the symptom, run the quick check, apply the fix. Start with the dashboard at `http://localhost:3000`: the **Diagnostics** panel usually points at the right section.

Issues **T1–T4** happened during the build of this project. **T5–T10** are other common problems with this setup.

| Symptom | Go to |
|---|---|
| `docker compose up` fails with "ports are not available" | [T1](#t1-docker-compose-up-fails-with-ports-are-not-available) |
| Phone says "error during connection" or "SIP UDP not found"; nothing in the SIP log | [T1](#t1-docker-compose-up-fails-with-ports-are-not-available), then [T2](#t2-phone-cant-register-pc-softphone-works) |
| PC softphone registers, phone on Wi-Fi doesn't | [T2](#t2-phone-cant-register-pc-softphone-works) |
| Phone shows **401 Unauthorized** | [T3](#t3-phone-shows-401-unauthorized) |
| Call connects but no audio / one-way audio | [T4](#t4-call-connects-but-theres-no-audio) |
| Pressing 9 does nothing | [T5](#t5-pressing-9-doesnt-unlock) |
| Dashboard: "Asterisk PBX" check is red | [T6](#t6-dashboard-asterisk-pbx-check-is-red) |
| Dashboard: red banner "Can't reach the backend" | [T7](#t7-dashboard-shows-cant-reach-the-backend) |
| Calls work but nothing appears in the access log | [T8](#t8-calls-work-but-the-access-log-stays-empty) |
| Log shows **Phone offline** (CHANUNAVAIL) | [T9](#t9-log-shows-phone-offline) |
| Everything stopped working after a reboot or a router restart | [T10](#t10-it-worked-yesterday-and-now-nothing-registers) |

---

## T1. `docker compose up` fails with "ports are not available"

**Quick check**
```powershell
netstat -ano | findstr :5060
```
If a line appears, another program owns UDP 5060. The number at the end is its process ID.

**Cause:** Docker can't publish a port another program already uses. Asterisk then runs but is unreachable, so every phone fails silently.

**Fix:** Move the PC side of the mapping to a free port. In `docker-compose.yml`:
```yaml
- "5061:5060/udp"     # left side = PC port, right side = Asterisk inside the container
```
In `pjsip.conf`, set `external_signaling_port=5061`. Then:
```bash
docker compose down
docker compose up -d
```
Register all phones to `:5061`.

> `docker compose down` must run in the project folder, and `docker ps` should show nothing afterwards. Otherwise the old container is still holding the port.

---

## T2. Phone can't register; PC softphone works

**Quick check:** Run `ipconfig`. Is the IP in the phone's Domain field the one under **Wireless LAN adapter Wi-Fi**?

**Causes, most to least likely**
1. **Wrong adapter IP.** `192.168.56.x` (VirtualBox) and `172.x` (WSL / Hyper-V) addresses are virtual and the phone can't reach them.
2. **Windows Firewall** is blocking inbound UDP.
3. The phone is on **mobile data or a guest network** instead of the same Wi-Fi.
4. **iPhone Local Network permission** is off for Zoiper.

**Fix**
1. Use the Wi-Fi IPv4 address in the phone's Domain field and in `pjsip.conf`, then restart Asterisk.
2. Add the firewall rule from the setup guide (UDP 5061 and 10000–10100).
3. Check the phone's Wi-Fi network name matches the PC's.
4. On iPhone: Settings → Zoiper → Local Network → On.

**Confirm:** In the Asterisk console, run `pjsip set logger on` and retry. If nothing at all appears, the request isn't reaching Asterisk (cause 1–4). If text appears, go to T3.

---

## T3. Phone shows "401 Unauthorized"

**What it means:** Good news first: the phone **is** reaching Asterisk. The login details are wrong.

**Cause during this build:** The **User name** field contained `101@10.0.0.151`. It must be the extension number only.

**Fix**
| Field | Correct value |
|---|---|
| User name | `101` |
| Domain | `<PC IP>:5061` |
| Password | `SuitePass101` (case-sensitive; watch for iOS auto-capitalisation) |
| Auth username | `101` or blank |

**Confirm in the Asterisk console**
- `Failed to authenticate` → the password is wrong
- `No matching endpoint found` → the username is wrong

---

## T4. Call connects but there's no audio

**Quick check:** Dial `600` from the PC (echo test).
- Echo works, but calls to the phone don't → a network or firewall issue between the phone and the PC
- Echo doesn't work either → Asterisk's NAT settings

**Cause during this build:** `local_net` lines in `pjsip.conf`. With Docker Desktop, the PC's traffic reaches Asterisk from a `172.x` address. `local_net` made Asterisk treat it as local and tell the softphone to send audio to the container's internal IP, which Windows can't reach.

**Fix**
1. In `pjsip.conf`, remove all `local_net=` lines. Keep `external_media_address` set to the PC's Wi-Fi IP.
2. Check the RTP range matches in both places: `rtp.conf` (10000–10100) and `docker-compose.yml`.
3. Check the firewall rule includes UDP 10000–10100.
4. Check microphone permissions (Windows Privacy → Microphone; iPhone Settings → Zoiper → Microphone).

**Confirm:** Run `rtp set debug on` and make a call. You should see both `Got RTP` and `Sent RTP` lines. If only `Sent` appears, the phone's audio isn't reaching Asterisk.

---

## T5. Pressing 9 doesn't unlock

**Quick checks**
1. In the Asterisk console, run `features show`. `unlock` (key 9) and `deny` (key 0) must be listed.
2. Watch the console while pressing 9. You should see `Suite 101 pressed 9: UNLOCK`.

**Causes and fixes**
| Cause | Fix |
|---|---|
| `features.conf` not mounted | Check `docker-compose.yml` mounts it, then `docker compose restart asterisk` |
| Softphone sends keypresses in-band (as audio) | Zoiper → account → DTMF: set **RFC 2833** (same as RFC 4733) |
| Pressed 9 on the **lobby** side | By design, only the resident's side can unlock |
| Pressed before the call was answered | Keys only work during a connected call |

---

## T6. Dashboard: "Asterisk PBX" check is red

The detail text tells you which case you're in:

| Detail | Cause | Fix |
|---|---|---|
| `No response from Asterisk within 2s` | Asterisk container down, or `http.conf` not loaded | `docker ps`; check `http.conf` is mounted; `docker compose restart asterisk` |
| `ARI login rejected` | Password in `docker-compose.yml` (`ARI_PASS`) doesn't match `config/ari.conf` | Make them match, then `docker compose up -d` |
| `ARI ... returned HTTP 404` | `ari.conf` not loaded | Check the mount, then restart Asterisk |

---

## T7. Dashboard shows "Can't reach the backend"

**Cause:** The `api` container is stopped or crashed.

**Fix**
```bash
docker ps                  # is "api" listed?
docker compose logs api    # why did it stop?
docker compose up -d api
```

---

## T8. Calls work but the access log stays empty

**Quick check:** Can Asterisk reach the API?
```bash
docker exec asterisk curl -s http://api:3000/health
```
- `{"ok": true}` → the connection is fine. Run `dialplan show condo` and confirm the `h` extension and `Set(__SUITE=...)` lines exist. If they don't, the old `extensions.conf` is loaded: copy the new one in and run `dialplan reload`.
- An error → both containers must be started from the same `docker-compose.yml` so they share a network. Run `docker compose down`, then `docker compose up -d`.

---

## T9. Log shows "Phone offline"

**Meaning:** The lobby called a suite whose phone wasn't registered at that moment (`CHANUNAVAIL`).

**Fix:** Check that suite's card in **Devices** on the dashboard. If it's yellow, follow T2 for that phone. On iPhone, Zoiper may stop registering when it's closed in the background. Reopen it, or enable push in Zoiper's settings.

---

## T10. It worked yesterday and now nothing registers

**Cause:** The router gave the PC a new IP address.

**Fix:** Run `ipconfig`. If the Wi-Fi IPv4 changed, update `pjsip.conf` and the phone's Domain, then `docker compose restart asterisk`.

**Prevent it:** Reserve the PC's IP in the router's DHCP settings (often called *DHCP reservation* or *static lease*).

---

## Escalation checklist

If none of the above fixes it, collect this before escalating:

1. A screenshot of the dashboard Diagnostics panel
2. `docker ps` output
3. `pjsip show endpoints` output
4. 30 seconds of `pjsip set logger on` output while reproducing the problem
5. `docker compose logs --tail 100 api`
6. Exactly what the caller and the resident each saw or heard
