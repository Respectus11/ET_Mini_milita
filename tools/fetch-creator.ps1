$ErrorActionPreference = 'SilentlyContinue'
$target = 'C:\Projects\Games\ET_Mini_Milita\tools\CocosCreator-v3.8.6-win.zip'
$url = 'https://download.cocos.com/CocosCreator/v3.8.6/CocosCreator-v3.8.6-win-032501.zip'
$expected = 994471331
$deadline = (Get-Date).AddHours(4)

while ((Get-Date) -lt $deadline) {
    $size = 0
    if (Test-Path $target) { $size = (Get-Item $target).Length }
    if ($size -ge $expected) { break }
    Start-Process -FilePath 'curl.exe' `
        -ArgumentList '-sS','-f','-L','--retry','10','--retry-delay','3','--connect-timeout','30',`
                      '--speed-limit','10000','--speed-time','60','-C','-','-o',$target,$url `
        -WindowStyle Hidden -Wait | Out-Null
    Start-Sleep -Seconds 2
}
"done: $((Get-Item $target).Length) of $expected"
