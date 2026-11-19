Option Explicit
Dim app, result
On Error Resume Next
Set app = GetObject(, "Photoshop.Application")
If Err.Number <> 0 Then
  WScript.Echo "Photoshop indisponivel: " & Err.Description
  WScript.Quit 1
End If
Err.Clear
result = app.DoJavaScript("app.version + ' | documentos: ' + app.documents.length")
If Err.Number <> 0 Then
  WScript.Echo "Automacao indisponivel: " & Err.Description
  WScript.Quit 2
End If
WScript.Echo result
