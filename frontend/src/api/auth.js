import axios from "axios";

const BASE_URL = "http://127.0.0.1:8000/api/accounts/";

export const sendOtp = (phone) => {
  return axios.post(BASE_URL + "send-otp/", { phone });
};

export const verifyOtp = (phone, otp) => {
  return axios.post(BASE_URL + "verify-otp/", { phone, otp });
};