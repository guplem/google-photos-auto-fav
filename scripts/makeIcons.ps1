# Draws the extension icons.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File scripts/makeIcons.ps1
# The artwork is a star, the same mark Google Photos uses for a favourite.

Add-Type -AssemblyName System.Drawing

$source = 512
$bitmap = New-Object System.Drawing.Bitmap($source, $source)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

# Dark rounded square background.
$radius = [int]($source * 0.22)
$background = New-Object System.Drawing.Drawing2D.GraphicsPath
$background.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
$background.AddArc($source - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
$background.AddArc($source - $radius * 2, $source - $radius * 2, $radius * 2, $radius * 2, 0, 90)
$background.AddArc(0, $source - $radius * 2, $radius * 2, $radius * 2, 90, 90)
$background.CloseFigure()
$backgroundBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 32, 33, 36))
$graphics.FillPath($backgroundBrush, $background)

# A five-pointed star, filled amber.
$centreX = 256.0
$centreY = 268.0
$outerRadius = 158.0
$innerRadius = 66.0
$points = @()
for ($corner = 0; $corner -lt 10; $corner++) {
  $radiusForCorner = if ($corner % 2 -eq 0) { $outerRadius } else { $innerRadius }
  # Start at the top point: -90 degrees, then one corner every 36 degrees.
  $angle = ([Math]::PI / 180.0) * (-90.0 + 36.0 * $corner)
  $x = $centreX + $radiusForCorner * [Math]::Cos($angle)
  $y = $centreY + $radiusForCorner * [Math]::Sin($angle)
  $points += (New-Object System.Drawing.PointF([float]$x, [float]$y))
}
$starBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 253, 214, 99))
$graphics.FillPolygon($starBrush, [System.Drawing.PointF[]]$points)

$outputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

foreach ($size in 16, 32, 48, 128) {
  $scaled = New-Object System.Drawing.Bitmap($size, $size)
  $scaledGraphics = [System.Drawing.Graphics]::FromImage($scaled)
  $scaledGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $scaledGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $scaledGraphics.DrawImage($bitmap, 0, 0, $size, $size)
  $scaled.Save((Join-Path $outputDirectory "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $scaledGraphics.Dispose()
  $scaled.Dispose()
  Write-Host "wrote icon$size.png"
}

$graphics.Dispose()
$bitmap.Dispose()
