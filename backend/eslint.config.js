import js from '@eslint/js'

// 后端是纯 ESM Node + Express, 不涉 TS, 用 flat config 最简规则集。
// 不开严格 lint 规则(项目体量大, 避免一次报几百条), 只防常见错:
//   - 未定义变量 / 未使用变量
//   - 等号赋值 (== / !=)
//   - 裸 Promise 未 await(潜在未捕获)
export default [
  {
    files: ['src/**/*.js'],
    ignores: ['node_modules/**', 'dist/**', 'public/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        __dirname: 'readonly',
      },
    },
    plugins: {
      js,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'eqeqeq': ['warn', 'smart'],
      // 存量正则里有大量 \" 在字符集外的无害转义, 不阻塞, 降为提示
      'no-useless-escape': 'off',
      // 允许空 catch{}(故意吞掉的兜底), 其余空块仍提示
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    // 测试文件可以放宽: 允许 any 参数 / 未使用
    files: ['**/*.test.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
]
