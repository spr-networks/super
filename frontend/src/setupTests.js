// fix ReferenceError: regeneratorRuntime is not defined
import "@babel/polyfill";
import '@testing-library/jest-dom/extend-expect';

process.env.REACT_APP_API="mock"
