Option Explicit
Dim app, result
If WScript.Arguments.Count <> 1 Then WScript.Quit 3
On Error Resume Next
Set app = GetObject(, "Photoshop.Application")
If Err.Number <> 0 Then
  WScript.Echo "Abra o Photoshop e tente novamente."
  WScript.Quit 1
End If
Err.Clear
result = app.DoJavaScriptFile(WScript.Arguments.Item(0))
If Err.Number <> 0 Then
  WScript.Echo "Falha na montagem: " & Err.Description
  WScript.Quit 2
End If
If Left(CStr(result), 6) = "ERROR|" Then
  WScript.Echo result
  WScript.Quit 2
End If
WScript.Echo "Montagem concluida."
