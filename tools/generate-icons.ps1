<#
.SYNOPSIS
  SlowGram launcher-icon generator (pure System.Drawing - no npm, no Gradle).

.DESCRIPTION
  Takes ONE square source image and emits every launcher asset:
    mipmap-{mdpi..xxxhdpi}/ic_launcher.png        (48..192 px, rounded-square)
    mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png  (48..192 px, circle)
    mipmap-{mdpi..xxxhdpi}/ic_launcher_foreground.png
        (108dp grid: 108/162/216/324/432 px, art in the 66/108 safe zone)

  If the source image is missing, a DEFAULT SlowGram logo (the hourglass
  motif on the dark brand background) is generated first, so the pipeline
  works out of the box.

.USAGE
  Replace the logo: drop your own 1024x1024 square PNG at
  design/logo-source.png, then run:  pwsh tools/generate-icons.ps1
  Custom paths:                      pwsh tools/generate-icons.ps1 -SourcePath <png> -ResDir <res>
#>
param(
    [string]$SourcePath = "",
    [string]$ResDir = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot   # tools/ -> repo root
if (-not $SourcePath) { $SourcePath = Join-Path $repoRoot "design/logo-source.png" }
if (-not $ResDir)     { $ResDir     = Join-Path $repoRoot "android/app/src/main/res" }

# ---------------------------------------------------------------------------
# 1. Default source art (hourglass identity) when none was provided yet.
# ---------------------------------------------------------------------------
function New-DefaultLogo {
    param([string]$Path, [int]$Size = 1024)

    $bg = [System.Drawing.Color]::FromArgb(0x0E, 0x0E, 0x12)      # brand dark
    $fg = [System.Drawing.Color]::FromArgb(0xE8, 0xF6, 0xEC)      # pale mint
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear($bg)

    # The original vector lives on a 108-unit viewport; map it to $Size.
    $k = $Size / 108.0

    $penW = 4.2 * $k
    $pen = New-Object System.Drawing.Pen($fg, [single]$penW)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $topA    = New-Object System.Drawing.PointF((34 * $k), (31 * $k));
    $topB    = New-Object System.Drawing.PointF((74 * $k), (31 * $k));
    $center  = New-Object System.Drawing.PointF((54 * $k), (55 * $k));
    $botA    = New-Object System.Drawing.PointF((34 * $k), (77 * $k));
    $botB    = New-Object System.Drawing.PointF((74 * $k), (77 * $k));
    $threadA = New-Object System.Drawing.PointF((54 * $k), (56 * $k));
    $threadB = New-Object System.Drawing.PointF((54 * $k), (61 * $k));
    $sandA   = New-Object System.Drawing.PointF((41 * $k), (75 * $k));
    $sandB   = New-Object System.Drawing.PointF((54 * $k), (60 * $k));
    $sandC   = New-Object System.Drawing.PointF((67 * $k), (75 * $k));

    # top bar + funnel outlines + falling thread
    $g.DrawLine($pen, $topA, $topB);
    $g.DrawLines($pen, @($topA, $center, $topB));
    $g.DrawLines($pen, @($botA, $center, $botB));
    $threadPen = New-Object System.Drawing.Pen($fg, [single](3.0 * $k));
    $threadPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round;
    $threadPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round;
    $g.DrawLine($threadPen, $threadA, $threadB);
    # sand in the lower bulb
    $brush = New-Object System.Drawing.SolidBrush($fg);
    $g.FillPolygon($brush, @($sandA, $sandB, $sandC));

    $g.Dispose(); $pen.Dispose(); $threadPen.Dispose(); $brush.Dispose()
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("default logo written -> " + $Path)
}

if (-not (Test-Path $SourcePath)) {
    Write-Host "source image not found - generating the default SlowGram logo:"
    New-DefaultLogo -Path $SourcePath
}

# ---------------------------------------------------------------------------
# 2. Load + normalize the source onto a 1024px master.
# ---------------------------------------------------------------------------
$src = [System.Drawing.Image]::FromFile($SourcePath)
if ($src.Width -ne $src.Height) {
    $src.Dispose()
    throw ("logo-source must be SQUARE (got " + $src.Width + "x" + $src.Height + "): " + $SourcePath)
}
$master = New-Object System.Drawing.Bitmap(1024, 1024)
$mg = [System.Drawing.Graphics]::FromImage($master)
$mg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$mg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$mg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$mg.DrawImage($src, 0, 0, 1024, 1024)
$mg.Dispose()
$src.Dispose()

function Resize-Master {
    param([int]$Side)
    $b = New-Object System.Drawing.Bitmap($Side, $Side)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($master, 0, 0, $Side, $Side)
    $g.Dispose()
    return $b
}

function Save-Masked {
    # Clip the resized master to a shape (rounded square / circle) and save.
    param([int]$Side, [string]$Shape, [string]$OutFile)
    $art = Resize-Master -Side $Side
    $out = New-Object System.Drawing.Bitmap($Side, $Side, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($Shape -eq "circle") {
        $path.AddEllipse(0, 0, $Side, $Side)
    } else {
        # rounded square, radius ~18% of side (modern-launcher look)
        $r = [single]($Side * 0.18)
        $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
        $path.AddArc($Side - $r * 2, 0, $r * 2, $r * 2, 270, 90)
        $path.AddArc($Side - $r * 2, $Side - $r * 2, $r * 2, $r * 2, 0, 90)
        $path.AddArc(0, $Side - $r * 2, $r * 2, $r * 2, 90, 90)
        $path.CloseFigure()
    }
    $g.SetClip($path)
    $g.DrawImage($art, 0, 0, $Side, $Side)
    $g.Dispose()
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
    $out.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose(); $art.Dispose(); $path.Dispose()
}

function Save-Foreground {
    # Adaptive foreground: 108dp canvas, art scaled into the 66dp safe zone,
    # transparent elsewhere (the adaptive background supplies the color).
    param([int]$Canvas, [string]$OutFile)
    $content = [int][Math]::Round($Canvas * 66.0 / 108.0)
    $off = [int](($Canvas - $content) / 2)
    $art = Resize-Master -Side $content
    $out = New-Object System.Drawing.Bitmap($Canvas, $Canvas, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.DrawImage($art, $off, $off, $content, $content)
    $g.Dispose()
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
    $out.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose(); $art.Dispose()
}

# ---------------------------------------------------------------------------
# 3. Emit every density.
# ---------------------------------------------------------------------------
$densities = @(
    @{ name = "mdpi";    legacy = 48;  fg = 108 },
    @{ name = "hdpi";    legacy = 72;  fg = 162 },
    @{ name = "xhdpi";   legacy = 96;  fg = 216 },
    @{ name = "xxhdpi";  legacy = 144; fg = 324 },
    @{ name = "xxxhdpi"; legacy = 192; fg = 432 }
)

foreach ($d in $densities) {
    $dir = Join-Path $ResDir ("mipmap-" + $d.name)
    Save-Masked -Side $d.legacy -Shape "rounded" -OutFile (Join-Path $dir "ic_launcher.png")
    Save-Masked -Side $d.legacy -Shape "circle"  -OutFile (Join-Path $dir "ic_launcher_round.png")
    Save-Foreground -Canvas $d.fg -OutFile (Join-Path $dir "ic_launcher_foreground.png")
    Write-Host ("  mipmap-" + $d.name + ": ic_launcher=" + $d.legacy + "px foreground=" + $d.fg + "px")
}

$master.Dispose()
Write-Host "done. Rebuild the app to pick up the new assets."
