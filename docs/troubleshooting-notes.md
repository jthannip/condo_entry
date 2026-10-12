# Troubleshooting notes (raw)

Log every problem you hit here as you go. On Day 4 these become the dealer troubleshooting guide.

| # | Symptom | What I checked | Root cause | Fix |
|---|---------|----------------|------------|-----|
| 1 | Softphone says "error during connection"; nothing appears in `pjsip set logger on` | `pjsip show endpoints` (endpoints existed), retried on 127.0.0.1, `docker compose up` error "ports are not available", `netstat -ano \| findstr :5060` | Another Windows process already owned UDP 5060, so Docker never published SIP | Map host port 5061 to container 5060 in docker-compose.yml; register phones to `:5061` |
| 2 | iPhone can't register; PC works on 127.0.0.1 | `ipconfig` adapter list | Used 192.168.56.1, the VirtualBox host-only adapter, instead of the Wi-Fi IP | Use the IPv4 under "Wireless LAN adapter Wi-Fi" in pjsip.conf and in the phone's Domain |
| 3 | iPhone Zoiper: "401 Unauthorized" | Zoiper account fields | Username field had `101@IP` instead of `101` | Username = `101` only; IP:port goes in Domain |
| 4 | Calls connect, no audio | pjsip.conf transport section | `local_net` lines made Asterisk advertise the container's internal IP to clients | Remove `local_net` lines; keep `external_media_address` = host Wi-Fi IP |
