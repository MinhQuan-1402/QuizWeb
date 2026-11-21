Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] > $null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime] > $null
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] > $null
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod})[0]
function Await($op,$type){$task=$asTask.MakeGenericMethod($type).Invoke($null,@($op)); $task.Wait(); $task.Result}
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result=@()
foreach($n in 1..60){
$p='C:\Users\quanh\Downloads\MLN131_sp26_FE\screenshot_{0:d2}.png' -f $n
$im=[Drawing.Bitmap]::FromFile($p)
$crop=$im.Clone([Drawing.Rectangle]::new(740,95,640,510),$im.PixelFormat)
$big=[Drawing.Bitmap]::new($crop,1920,1530)
$temp=Join-Path $env:TEMP 'quiz_ocr.png'; $big.Save($temp,[Drawing.Imaging.ImageFormat]::Png);$im.Dispose();$crop.Dispose();$big.Dispose()
$f=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($temp)) ([Windows.Storage.StorageFile])
$stream=Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$dec=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bmp=Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$r=Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
$result+=@{n=$n;text=($r.Lines.Text -join "`n")};$stream.Dispose()
}
$result | ConvertTo-Json | Set-Content -Encoding UTF8 D:\projects\QuizWeb\output_text\sp26_ocr_draft.json
