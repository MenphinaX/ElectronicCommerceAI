param(
  [string]$PathsFile
)
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Fldlg {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hDlg, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, string lParam);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  public const uint WM_SETTEXT = 0x000C;
  public const uint BM_CLICK = 0x00F5;
  public const uint WM_COMMAND = 0x0111;
}
"@
$paths = @()
if (Test-Path -LiteralPath $PathsFile) {
  $paths = Get-Content -LiteralPath $PathsFile -Encoding UTF8 | Where-Object { $_.Trim().Length -gt 0 }
}
$quoted = ($paths | ForEach-Object { '"' + $_ + '"' }) -join ' '
$dlg = [IntPtr]::Zero
for ($i = 0; $i -lt 40; $i++) {
  $dlg = [Fldlg]::FindWindow('#32770', '打开')
  if ($dlg -eq [IntPtr]::Zero) { $dlg = [Fldlg]::FindWindow('#32770', 'Open') }
  if ($dlg -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 500
}
if ($dlg -eq [IntPtr]::Zero) { Write-Output 'DIALOG_NOT_FOUND'; exit 1 }
$edit = [Fldlg]::GetDlgItem($dlg, 1148)
if ($edit -eq [IntPtr]::Zero) { Write-Output 'EDIT_1148_NOT_FOUND'; exit 2 }
[Fldlg]::SendMessage($edit, [Fldlg]::WM_SETTEXT, [IntPtr]::Zero, $quoted) | Out-Null
Start-Sleep -Milliseconds 500
$ok = [Fldlg]::GetDlgItem($dlg, 1)
if ($ok -ne [IntPtr]::Zero) {
  [Fldlg]::SendMessage($ok, [Fldlg]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
} else {
  [Fldlg]::SendMessage($dlg, [Fldlg]::WM_COMMAND, [IntPtr]1, [IntPtr]::Zero) | Out-Null
}
Write-Output 'WM_SETTEXT_CLICK_DONE'