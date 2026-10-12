# Knowledge base

Short how-to articles for installers and building managers.

- [KB-001 Add a new suite](#kb-001-add-a-new-suite)
- [KB-002 Change a phone's SIP password](#kb-002-change-a-phones-sip-password)
- [KB-003 Read the dashboard diagnostics](#kb-003-read-the-dashboard-diagnostics)
- [KB-004 Unlock the door from the dashboard](#kb-004-unlock-the-door-from-the-dashboard)
- [KB-005 Find and export the access log](#kb-005-find-and-export-the-access-log)
- [KB-006 What the resident's keys do during a call](#kb-006-what-the-residents-keys-do-during-a-call)

---

## KB-001 Add a new suite

Suites 101–109 can be added without touching the dialplan. Example: adding Suite 103.

**1. `config/pjsip.conf`:** copy an existing suite block and change the number and password:
```ini
; ---------- 103: Suite 103 ----------
[103](endpoint-template)
auth=103
aors=103
callerid="Suite 103" <103>

[103](auth-template)
username=103
password=SuitePass103

[103](aor-template)
```

**2. `api/residents.json`:** add the suite so the dashboard shows its name:
```json
"103": { "label": "Suite 103", "role": "suite", "resident": "Resident Name" }
```

**3. Apply**
```bash
docker exec asterisk asterisk -rx "pjsip reload"
docker compose up -d --build api
```

**4. Verify:** Register a phone as `103` (see the setup guide, step 7). Suite 103 turns green under **Devices**. Call `103` from the lobby.

---

## KB-002 Change a phone's SIP password

1. In `config/pjsip.conf`, change `password=` in that extension's `auth` block.
2. Run `docker exec asterisk asterisk -rx "pjsip reload"`.
3. Update the password in that phone's Zoiper account.

The phone shows **401 Unauthorized** until step 3 is done. That's expected.

> The default passwords in this project are demo values. Change all of them for any real installation.

---

## KB-003 Read the dashboard diagnostics

Open `http://localhost:3000`. Checks refresh every 3 seconds.

| Colour | Meaning |
|---|---|
| Green | Working |
| Yellow | Needs attention, but the system still works (e.g. a suite has no phone registered) |
| Red | Visitors are affected (e.g. Asterisk down, or the **lobby panel** offline) |

Each yellow or red check shows a one-line fix underneath. The full fix is in the [troubleshooting guide](troubleshooting.md).

**Device status comes from Asterisk itself.** Asterisk pings each phone every 30 seconds, so a phone that loses Wi-Fi turns yellow within about 30 seconds.

---

## KB-004 Unlock the door from the dashboard

Click **Unlock door (5 s)** under *Front door*. The door unlocks for 5 seconds and relocks automatically. The access log records it as *Door unlocked · Unlocked from dashboard*.

> There's no login on the dashboard in this demo, so anyone who can open it can unlock the door. Keep port 3000 on a trusted network.

---

## KB-005 Find and export the access log

The log is stored on the server PC at `data/access-log.jsonl` in the project folder. It has one JSON event per line and survives container restarts.

- **View in a browser:** `http://localhost:3000/api/events?limit=500`
- **Back up the raw file:** copy `data/access-log.jsonl`
- **Open in Excel:** open `http://localhost:3000/api/events?limit=5000` in the browser and save the page as `access-log.json`. In Excel, go to Data → Get Data → From File → From JSON, select it, then choose *To Table* and expand the columns.

Event types: `call` (with `status`), `unlock`, `deny`. Unlocks from the dashboard have `"via": "dashboard"`.

---

## KB-006 What the resident's keys do during a call

| Key | Action | Logged as |
|---|---|---|
| **9** | Unlocks the front door for 5 seconds; resident hears a beep | Door unlocked |
| **0** | Denies entry | Entry denied |

The keys work only on the **resident's** side, and only after the call is answered. Pressing them on the lobby panel does nothing.
