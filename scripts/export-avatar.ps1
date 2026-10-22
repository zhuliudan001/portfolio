param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Avatar,
    [Parameter(Mandatory = $true)][string]$Favicon
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Scale-Square([string]$src, [string]$dst, [int]$size) {
    $img = [System.Drawing.Image]::FromFile($src)
    try {
        $min = [Math]::Min($img.Width, $img.Height)
        $sx = [int](($img.Width - $min) / 2)
        $sy = [int](($img.Height - $min) / 2)

        $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $dest = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
            $srcRect = New-Object System.Drawing.Rectangle($sx, $sy, $min, $min)
            $g.DrawImage($img, $dest, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        } finally {
            $g.Dispose()
        }
        $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    } finally {
        $img.Dispose()
    }
    Write-Output "$dst <- $size px, $((Get-Item $dst).Length) bytes"
}

Scale-Square $Source $Avatar 256
Scale-Square $Source $Favicon 32
