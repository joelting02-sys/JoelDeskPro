$ErrorActionPreference = 'Stop'
$csPath = Join-Path $PSScriptRoot 'tdm-host.cs'
$code = [System.IO.File]::ReadAllText($csPath, [System.Text.Encoding]::UTF8)
Add-Type -TypeDefinition $code -ReferencedAssemblies 'System.Web.Extensions'
[TdmHostProgram]::Run()
