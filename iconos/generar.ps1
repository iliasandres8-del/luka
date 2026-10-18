# Genera los íconos de Luka: tres tarjetas apiladas (ahorro, salidas, comida) con la L.
# Uso: powershell -File iconos\generar.ps1
Add-Type -AssemblyName System.Drawing
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Redondo($g, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $g.FillPath($brush, $p)
}

function Icono([int]$tam, [string]$nombre, [bool]$mascara) {
  $bmp = New-Object System.Drawing.Bitmap $tam, $tam
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $s = $tam / 64.0
  $fondo = [System.Drawing.ColorTranslator]::FromHtml('#f7faf8')
  if ($mascara) { $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#1f7a55')) }
  else {
    $g.Clear([System.Drawing.Color]::Transparent)
    Redondo $g (New-Object System.Drawing.SolidBrush $fondo) 0 0 $tam $tam (14 * $s)
  }
  # En la máscara el dibujo va más chico para que no lo recorte el círculo
  $k = if ($mascara) { 0.62 } else { 0.78 }
  $o = (64 - 64 * $k) / 2
  $sx = { param($v) ($o + $v * $k) * $s }
  $c = @('#2f4fb5', '#c4553b', '#e2b13c')
  $ys = @(26, 17, 8)
  for ($i = 0; $i -lt 3; $i++) {
    $b = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($c[$i]))
    Redondo $g $b (& $sx 4) (& $sx $ys[$i]) (56 * $k * $s) (30 * $k * $s) (8 * $k * $s)
  }
  $f = New-Object System.Drawing.Font('Segoe UI Black', [float](17 * $k * $s), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString('L', $f, (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#2a1e05'))), [float](& $sx 10), [float](& $sx 10))
  $bmp.Save((Join-Path $dir $nombre), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Icono 512 'icono-512.png' $false
Icono 192 'icono-192.png' $false
Icono 180 'icono-180.png' $false
Icono 64 'favicon-64.png' $false
Icono 32 'favicon-32.png' $false
Icono 512 'icono-maskable-512.png' $true
