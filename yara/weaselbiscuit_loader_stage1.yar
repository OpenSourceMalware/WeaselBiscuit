rule WeaselBiscuit_Loader_Stage1
{
    meta:
        author      = "OpenSourceMalware.com"
        description = "WeaselBiscuit first-stage npm loader: detached node process + Npoint dead-drop + Base64 new Function eval"
        family      = "WeaselBiscuit"
        reference   = "https://opensourcemalware.com/blog/weaselbiscuit-dprk-malware"
        severity    = "high"
        date        = "2026-09-17"
        stage       = "1"
    strings:
        $npoint  = "api.npoint.io/" ascii
        $eval    = "new Function(" ascii
        $b64_re  = /Buffer\.from\s*\(\s*[A-Za-z0-9_.\[\]]+\s*,\s*['"]base64['"]\s*\)/ ascii
        $code    = "\"code\"" ascii
        $detach  = /detached\s*:\s*true/ ascii
        $pid     = ".pid" ascii
        $spawn   = "child_process" ascii
        $init    = "initialize" ascii
    condition:
        filesize < 200KB
        and $npoint
        and $eval
        and $b64_re
        and 2 of ($detach, $pid, $spawn, $init, $code)
}
