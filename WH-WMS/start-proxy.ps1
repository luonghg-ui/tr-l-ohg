# ═══════════════════════════════════════════════════════════════
# BuyMed WMS Proxy Server — PowerShell Version v2
# Chay bang: .\start-proxy.ps1  hoac bam dup START SERVER.bat
# Khong can cai Node.js hay Python!
# ═══════════════════════════════════════════════════════════════

$PORT = 3000

# Token mac dinh (fallback) — tu cap nhat khi nhan POST /update-token
$script:SID   = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJwckVWMVpqaDJld1VSOUs2YXBORkZSaThuVHE0clRwRXB1aUcyRzI2QzV6d05XeUEiLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg=="
$script:TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJyeVVwNGh5RDk3TUkzNFJHaWVZNTdoZ0NiZTc2eld5VXZoSE13eWZxMkUybmpYNHQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo="

# Endpoint pick-list (se tu phat hien bang /discover)
$script:PICK_ENDPOINT = "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/pick-list"

# ─── Auth Headers ─────────────────────────────────────────────
function Get-AuthHeaders {
    return @{
        "Authorization"    = "Bearer $($script:TOKEN)"
        "x-session-token"  = $script:TOKEN
        "Cookie"           = "SID=$($script:SID); session_token=$($script:TOKEN); lang=vi; ACCOUNT_CHOOSER=dmluaC52ZA=="
        "User-Agent"       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
        "Accept"           = "application/json, text/plain, */*"
        "Accept-Language"  = "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
        "Referer"          = "https://internal.thuocsi.vn/"
        "Origin"           = "https://internal.thuocsi.vn"
        "sec-ch-ua"        = '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"'
        "sec-ch-ua-platform" = '"Windows"'
        "sec-fetch-site"   = "same-origin"
        "sec-fetch-mode"   = "cors"
        "sec-fetch-dest"   = "empty"
    }
}

# ─── HTTP Listener ────────────────────────────────────────────
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$PORT/")
$listener.Start()

Write-Host ""
Write-Host "BuyMed WMS Proxy Server (PowerShell) v2 - RUNNING" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor DarkGray
Write-Host "  http://localhost:$PORT/ping            Health check" -ForegroundColor Cyan
Write-Host "  http://localhost:$PORT/wms/pick-list   Phieu PICK" -ForegroundColor Cyan
Write-Host "  http://localhost:$PORT/wms/inbound     Phieu nhap GRN" -ForegroundColor Cyan
Write-Host "  http://localhost:$PORT/search          Tim kiem SP" -ForegroundColor Cyan
Write-Host "  POST /update-token                     Cap nhat token moi" -ForegroundColor Cyan
Write-Host "  GET  /discover                         Tim dung endpoint" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor DarkGray
Write-Host "  Nhan Ctrl+C de dung server" -ForegroundColor Yellow
Write-Host ""

# ─── CORS ─────────────────────────────────────────────────────
function Set-CorsHeaders($response) {
    $response.Headers.Add("Access-Control-Allow-Origin",  "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.ContentType = "application/json; charset=utf-8"
}

# ─── Write JSON ───────────────────────────────────────────────
function Write-JsonResponse($context, $obj, $statusCode = 200) {
    $response = $context.Response
    Set-CorsHeaders($response)
    $response.StatusCode = $statusCode
    $json = $obj | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

# ─── Write Raw Body ───────────────────────────────────────────
function Write-RawResponse($context, $body, $statusCode = 200) {
    $response = $context.Response
    Set-CorsHeaders($response)
    $response.StatusCode = $statusCode
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

# ─── Read Request Body ────────────────────────────────────────
function Read-RequestBody($request) {
    if ($request.ContentLength64 -le 0) { return "" }
    $reader = [System.IO.StreamReader]::new($request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
}

# ─── BuyMed API Proxy ─────────────────────────────────────────
function Invoke-BuyMedAPI($url, $queryParams = @{}) {
    $headers = Get-AuthHeaders

    if ($queryParams.Count -gt 0) {
        $qsList = ($queryParams.GetEnumerator() | ForEach-Object {
            "$([Uri]::EscapeDataString($_.Key))=$([Uri]::EscapeDataString([string]$_.Value))"
        }) -join "&"
        $url = "${url}?${qsList}"
    }

    Write-Host "  -> GET $url" -ForegroundColor DarkCyan

    try {
        $r = Invoke-WebRequest -Uri $url -Headers $headers -Method GET -UseBasicParsing -TimeoutSec 15
        return @{ ok = $true; body = $r.Content; status = [int]$r.StatusCode }
    } catch {
        $code = 500
        $body = "{`"error`":`"Request failed`",`"message`":`"$($_.Exception.Message)`"}"
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            try {
                $rd = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
                $body = $rd.ReadToEnd()
                $rd.Close()
            } catch {}
        }
        Write-Host "  -> HTTP $code" -ForegroundColor Red
        return @{ ok = $false; body = $body; status = $code }
    }
}

# ─── Parse Query String ───────────────────────────────────────
function Get-QueryParams($rawUrl) {
    $params = @{}
    try {
        $uri = [Uri]"http://localhost$rawUrl"
        if ($uri.Query -and $uri.Query.Length -gt 1) {
            $uri.Query.TrimStart('?').Split('&') | ForEach-Object {
                $parts = $_ -split '=', 2
                if ($parts.Length -eq 2) {
                    $k = [Uri]::UnescapeDataString($parts[0])
                    $v = [Uri]::UnescapeDataString($parts[1])
                    $params[$k] = $v
                }
            }
        }
    } catch {}
    return $params
}

# ─── Endpoint Discovery ───────────────────────────────────────
function Find-PickListEndpoint {
    $candidates = @(
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/fulfillment/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/pick-slips",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/pick-list",
        "https://internal.thuocsi.vn/wms/v2/private/pick-list",
        "https://internal.thuocsi.vn/wms/v1/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/wms/v2/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/warehouse/private/pick-list",
        "https://internal.thuocsi.vn/ops/wms/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/orders/pick",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/shipments",
        "https://internal.thuocsi.vn/marketplace/order/private/pick-list"
    )
    $results = @()
    foreach ($url in $candidates) {
        try {
            $r = Invoke-WebRequest -Uri "${url}?offset=0&limit=1" -Headers (Get-AuthHeaders) -Method GET -UseBasicParsing -TimeoutSec 8
            Write-Host "  FOUND: $($r.StatusCode) $url" -ForegroundColor Green
            $results += @{ url = $url; status = [int]$r.StatusCode; body = $r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)) }
            if ([int]$r.StatusCode -lt 300) {
                $script:PICK_ENDPOINT = $url
                Write-Host "  *** Updated PICK_ENDPOINT to: $url ***" -ForegroundColor Green
            }
        } catch {
            $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            $results += @{ url = $url; status = $code; body = $null }
        }
    }
    return $results
}

# ═══════════════════════════════════════════════════════════════
# MAIN LOOP
# ═══════════════════════════════════════════════════════════════
while ($listener.IsListening) {
    try {
        $context  = $listener.GetContext()
        $req      = $context.Request
        $resp     = $context.Response
        $rawUrl   = $req.RawUrl
        $path     = $req.Url.AbsolutePath.TrimEnd('/')
        $method   = $req.HttpMethod
        $qp       = Get-QueryParams $rawUrl

        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $method $path" -ForegroundColor Gray

        # OPTIONS preflight
        if ($method -eq "OPTIONS") {
            Set-CorsHeaders($resp)
            $resp.StatusCode = 204
            $resp.OutputStream.Close()
            continue
        }

        # ── GET /ping ──────────────────────────────────────────
        if ($path -eq "/ping" -and $method -eq "GET") {
            Write-JsonResponse $context @{
                ok        = $true
                time      = (Get-Date -Format "o")
                endpoint  = $script:PICK_ENDPOINT
                tokenTail = $script:TOKEN.Substring([Math]::Max(0,$script:TOKEN.Length-20))
            }
            continue
        }

        # ── POST /update-token ─────────────────────────────────
        if ($path -eq "/update-token" -and $method -eq "POST") {
            $body = Read-RequestBody $req
            try {
                $data = $body | ConvertFrom-Json
                if ($data.sid -and $data.token) {
                    $script:SID   = $data.sid
                    $script:TOKEN = $data.token
                    Write-Host "  *** TOKEN UPDATED! SID tail: ...$(($script:SID)[-20..-1] -join '') ***" -ForegroundColor Green
                    Write-JsonResponse $context @{ ok = $true; message = "Token updated successfully" }
                } else {
                    Write-JsonResponse $context @{ ok = $false; message = "Missing sid or token field" } 400
                }
            } catch {
                Write-JsonResponse $context @{ ok = $false; message = "Invalid JSON: $_" } 400
            }
            continue
        }

        # ── GET /discover ──────────────────────────────────────
        if ($path -eq "/discover" -and $method -eq "GET") {
            Write-Host "  [DISCOVER] Scanning all pick-list endpoints..." -ForegroundColor Yellow
            $results = Find-PickListEndpoint
            Write-JsonResponse $context @{
                scanned        = $results.Count
                currentEndpoint = $script:PICK_ENDPOINT
                results        = $results
            }
            continue
        }

        # ── GET /wms/pick-list ─────────────────────────────────
        if ($path -eq "/wms/pick-list" -and $method -eq "GET") {
            $size   = if ($qp.size) { $qp.size } else { "20" }
            $page   = if ($qp.page) { $qp.page } else { "0"  }
            $offset = [int]$page * [int]$size

            $apiParams = @{ offset = "$offset"; limit = "$size" }

            $statusMap = @{
                waiting_hold = "WAITING_HOLD"
                picking      = "PICKING"
                waiting_cs   = "WAITING_CS"
                completed    = "COMPLETED"
            }
            if ($qp.status -and $qp.status -ne "all" -and $statusMap[$qp.status]) {
                $apiParams["status"] = $statusMap[$qp.status]
            }
            if ($qp.q -and $qp.q.Trim()) {
                $apiParams["soCode"] = $qp.q.Trim()
                $apiParams["code"]   = $qp.q.Trim()
            }

            $result = Invoke-BuyMedAPI $script:PICK_ENDPOINT $apiParams
            Write-RawResponse $context $result.body $result.status
            continue
        }

        # ── GET /wms/pick-list/{id} ────────────────────────────
        if ($path -match "^/wms/pick-list/(.+)$" -and $method -eq "GET") {
            $id     = $Matches[1]
            $result = Invoke-BuyMedAPI "$($script:PICK_ENDPOINT)/$id"
            Write-RawResponse $context $result.body $result.status
            continue
        }

        # ── GET /wms/inbound ───────────────────────────────────
        if ($path -eq "/wms/inbound" -and $method -eq "GET") {
            $size   = if ($qp.size) { $qp.size } else { "20" }
            $page   = if ($qp.page) { $qp.page } else { "0" }
            $offset = [int]$page * [int]$size
            $apiParams = @{ offset = "$offset"; limit = "$size" }
            if ($qp.q -and $qp.q.Trim()) { $apiParams["code"] = $qp.q.Trim() }

            $result = Invoke-BuyMedAPI "https://internal.thuocsi.vn/marketplace/warehouse/private/grn" $apiParams
            Write-RawResponse $context $result.body $result.status
            continue
        }

        # ── GET /search ────────────────────────────────────────
        if ($path -eq "/search" -and $method -eq "GET") {
            $q = $qp.q
            if (-not $q) {
                Write-JsonResponse $context @{ error = "Missing q parameter" } 400
                continue
            }
            $result = Invoke-BuyMedAPI "https://internal.thuocsi.vn/beehive/core/product/v1/products" @{ q = $q; keyword = $q }
            Write-RawResponse $context $result.body $result.status
            continue
        }

        # ── 404 ────────────────────────────────────────────────
        Write-JsonResponse $context @{ error = "Not found"; path = $path; method = $method } 404

    } catch [System.Net.HttpListenerException] {
        break
    } catch {
        Write-Host "[ERROR] $_" -ForegroundColor Red
        try { Write-JsonResponse $context @{ error = "Server error"; message = "$_" } 500 } catch {}
    }
}

$listener.Stop()
Write-Host "Server stopped." -ForegroundColor Yellow
