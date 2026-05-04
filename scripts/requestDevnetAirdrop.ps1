param(
  [Parameter(Mandatory = $true)]
  [string]$Address,

  [double]$AmountSol = 2.0
)

$ErrorActionPreference = 'Stop'
$lamports = [int64]([math]::Round($AmountSol * 1000000000))

$endpoints = @(
  'https://api.devnet.solana.com'
)

foreach ($endpoint in $endpoints) {
  Write-Output "AIRDROP_ENDPOINT=$endpoint"
  try {
    $payload = @{
      jsonrpc = '2.0'
      id      = 1
      method  = 'requestAirdrop'
      params  = @($Address, $lamports)
    } | ConvertTo-Json -Compress

    $response = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/json' -Body $payload

    if ($response.error) {
      $message = $response.error.message
      Write-Output "AIRDROP_FAILED=$message"
      continue
    }

    if ($response.result) {
      Write-Output "AIRDROP_SIGNATURE=$($response.result)"
      exit 0
    }

    Write-Output 'AIRDROP_FAILED=Unknown response format'
  } catch {
    Write-Output "AIRDROP_FAILED=$($_.Exception.Message)"
  }
}

exit 1
