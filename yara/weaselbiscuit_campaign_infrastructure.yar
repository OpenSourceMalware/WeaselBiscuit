rule WeaselBiscuit_Campaign_Infrastructure
{
    meta:
        author      = "OpenSourceMalware.com"
        description = "WeaselBiscuit campaign infrastructure hunt: shared C2, Npoint UUIDs, @biz44 scope. Broad on purpose - use as a lead, not a verdict."
        family      = "WeaselBiscuit"
        reference   = "https://opensourcemalware.com/blog/weaselbiscuit-dprk-malware"
        severity    = "medium"
        date        = "2026-09-17"
    strings:
        $c2_hostport = "103.170.217.184:8787" ascii
        $c2_ip       = "103.170.217.184" ascii

        $cfg_uuid = "37c0a0c68bf7a94ed731" ascii    // shared C2 config resolver
        $u99      = "24c25d5f5fcbb0992a4f" ascii    // ID 99
        $u10      = "641d37178a880b1e8b8f" ascii    // ID 10
        $u12      = "ddae72efbb6714fae922" ascii    // ID 12
        $u44      = "24c12c4b66a29747764f" ascii    // ID 44
        $u79      = "33e8d008c334b060adad" ascii    // ID 79
        $u95      = "933a731a5e97f4b45249" ascii    // ID 95

        $scope    = "@biz44/" ascii
        $pkg1     = "process-tailwind" ascii
        $pkg2     = "process-lhpm" ascii
        $pkg3     = "id79-client" ascii
        $pkg4     = "runtime-utils" ascii
        $pkg5     = "engin1" ascii
    condition:
        any of ($c2_hostport, $c2_ip, $cfg_uuid, $u10, $u12, $u44, $u79, $u95, $u99)
        or ($scope and 1 of ($pkg1, $pkg2, $pkg3, $pkg4, $pkg5))
}
