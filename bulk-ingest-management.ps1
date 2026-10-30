$ErrorActionPreference = "Stop"

$baseUrl = "https://rag-reflection-system.gangulasravani1.workers.dev"
$token = (Get-Content ".\policylens-admin-token.txt" -Raw).Trim()
$headers = @{ Authorization = "Bearer $token" }

$chunks = Get-Content ".\output\management-rag-chunks.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$remaining = @($chunks | Select-Object -Skip 26)
$batchSize = 10

function Send-Json($endpoint, $payload) {
    $json = ConvertTo-Json -InputObject $payload -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    Invoke-RestMethod `
        -Uri "$baseUrl/$endpoint" `
        -Method POST `
        -Headers $headers `
        -ContentType "application/json; charset=utf-8" `
        -Body $bytes `
        -TimeoutSec 120
}

Write-Host "Management chunks remaining: $($remaining.Count)"

for ($i = 0; $i -lt $remaining.Count; $i += $batchSize) {
    $end = [Math]::Min($i + $batchSize - 1, $remaining.Count - 1)
    $batch = @($remaining[$i..$end])
    $ids = @($batch | ForEach-Object { $_.id })

    Write-Host "`nBatch $([Math]::Floor($i / $batchSize) + 1): $($batch.Count) chunks"

    try {
        # If D1 insertion fails, do not blindly retry.
        $insert = Send-Json "ingest-documents" @{ chunks = $batch }

        if ($insert.success -ne $true -or
            $insert.stage -ne "d1_inserted" -or
            $insert.chunks_received -ne $batch.Count) {
            throw "Unexpected D1 ingestion response"
        }

        Write-Host "D1 insertion successful."

        $indexed = Send-Json "index-documents" @{ chunk_ids = $ids }

        if ($indexed.success -ne $true -or
            $indexed.stage -ne "vectorize_indexed" -or
            $indexed.vectors_upserted -ne $batch.Count) {
            throw "Unexpected Vectorize indexing response"
        }

        Write-Host "Vectorize indexing successful."
        Write-Host "Completed: $($i + $batch.Count) / $($remaining.Count)"
    }
    catch {
        Write-Host "STOPPED at batch starting with $($batch[0].id)" -ForegroundColor Red
        Write-Host $_.Exception.Message
        Write-Host "Do not rerun the script until we check D1 and Vectorize."
        exit 1
    }
}

Write-Host "`nAll remaining management chunks processed successfully!" -ForegroundColor Green
