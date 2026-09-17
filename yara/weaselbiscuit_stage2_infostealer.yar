import "hash"

rule WeaselBiscuit_Stage2_Infostealer
{
    meta:
        author      = "OpenSourceMalware.com"
        description = "WeaselBiscuit second-stage infostealer: Express polling C2 routes + host recon + Chrome extension theft"
        family      = "WeaselBiscuit"
        reference   = "https://opensourcemalware.com/blog/weaselbiscuit-dprk-malware"
        severity    = "high"
        date        = "2026-09-17"
        stage       = "2"
        stage2_sha256 = "7b15605f23b131b3eeea57e031ae7cb32fc4b78c7bbb2025aa7a561ea5ae5159"
    strings:
        $r1 = "/api/system-info" ascii
        $r2 = "/api/upload-local-extension-settings" ascii
        $r3 = "/api/clipboard-status/" ascii
        $r4 = "/api/clipboard-data" ascii
        $r5 = "/api/keyboard-mouse-status/" ascii
        $r6 = "/api/keyboard-mouse-data" ascii

        $ipify = "api.ipify.org" ascii
        $ipapi = "ip-api.com" ascii
        $mon   = "isMonitoring" ascii
        $ext   = "Local Extension Settings" ascii
        $pb    = "pbpaste" ascii
        $ps    = "Get-Clipboard" ascii
        $kb    = "kb-monitor" ascii
        $kbps  = "keyboard-monitor-" ascii
        $ident = /"identifier"\s*:\s*"?(10|12|44|79|95|99)"?/ ascii
    condition:
        filesize < 500KB
        and (
            3 of ($r*)
            or ($ipify and $ipapi and 2 of ($mon, $ext, $pb, $ps, $kb, $kbps))
            or ($ext and $mon and 1 of ($r*))
            or ($ident and 1 of ($r*))
            or hash.sha256(0, filesize) == "7b15605f23b131b3eeea57e031ae7cb32fc4b78c7bbb2025aa7a561ea5ae5159"
        )
}
