<?php
/**
 * Creative Insights - cPanel Image Upload Handler
 * Coloque este arquivo em uma pasta acessível web no seu cPanel (ex: public_html/ad-images/)
 * As imagens serão salvas na mesma pasta deste arquivo.
 */

// Permite conexões CORS (caso necessário)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Defina aqui a sua senha forte e aleatória (MESMA SENHA QUE ESTARÁ NO .ENV)
$SECRET_TOKEN = "troque-isso-por-uma-senha-forte-e-secreta-123456";

// Verifica a senha no header de Authorization
$headers = getallheaders();
$authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : (isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '');

if ($authHeader !== "Bearer " . $SECRET_TOKEN) {
    http_response_code(401);
    die(json_encode(["error" => "Não autorizado. Token inválido."]));
}

// Verifica se o arquivo foi enviado
if (!isset($_FILES['file'])) {
    http_response_code(400);
    die(json_encode(["error" => "Nenhum arquivo enviado."]));
}

$file = $_FILES['file'];

// Verifica erros no upload
if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(500);
    die(json_encode(["error" => "Erro no upload do arquivo (código: " . $file['error'] . ")."]));
}

// O nome que enviaremos a partir da plataforma via POST ('filename')
$customFilename = isset($_POST['filename']) ? preg_replace("/[^a-zA-Z0-9.\-_]/", "", $_POST['filename']) : null;

// Garante uma extensão de imagem .jpg por segurança
$filename = $customFilename ? $customFilename : time() . '_' . basename($file['name']);
if (!preg_match("/\.(jpe?g|png|webp|gif)$/i", $filename)) {
    $filename .= '.jpg';
}

$destination = __DIR__ . '/' . $filename;

// Move o arquivo temporário para o destino final
if (move_uploaded_file($file['tmp_name'], $destination)) {
    // Retorna a URL pública completa
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
    $domainName = $_SERVER['HTTP_HOST'];
    
    // Constrói a URL dinamicamente
    $urlPath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
    $publicUrl = $protocol . $domainName . $urlPath . '/' . $filename;

    http_response_code(200);
    echo json_encode([
        "success" => true,
        "url" => $publicUrl
    ]);
} else {
    http_response_code(500);
    echo json_encode(["error" => "Falha ao mover o arquivo no servidor."]);
}
?>
