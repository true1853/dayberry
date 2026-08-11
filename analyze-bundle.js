// Скрипт для анализа размера бандла
// Запустите: node analyze-bundle.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Анализ размера бандла Next.js...');

try {
  // Запускаем сборку с анализом
  execSync('npx next build && npx next export', { stdio: 'inherit' });
  
  // Проверяем размер экспортированных файлов
  const outDir = path.join(process.cwd(), 'out');
  if (fs.existsSync(outDir)) {
    const getDirSize = (dir) => {
      let size = 0;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          size += getDirSize(filePath);
        } else {
          size += stat.size;
        }
      }
      return size;
    };
    
    const totalSize = getDirSize(outDir);
    console.log(`\nОбщий размер экспортированного сайта: ${(totalSize / 1024 / 1024).toFixed(2)} МБ`);
    
    // Показываем самые большие файлы
    const getAllFiles = (dir, fileList = []) => {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          getAllFiles(filePath, fileList);
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
          fileList.push({ path: filePath, size: stat.size });
        }
      });
      return fileList;
    };
    
    const jsFiles = getAllFiles(outDir);
    jsFiles.sort((a, b) => b.size - a.size);
    
    console.log('\nТоп-10 největших файлов:');
    jsFiles.slice(0, 10).forEach((file, index) => {
      console.log(`${index + 1}. ${file.path.replace(outDir, '')} - ${(file.size / 1024).toFixed(2)} КБ`);
    });
  }
} catch (error) {
  console.error('Ошибка при анализе бандла:', error.message);
}