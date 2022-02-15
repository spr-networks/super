import React from "react";
import classnames from "classnames";
import Select from "react-select";

// reactstrap components
import {
  Label,
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  Row,
  Col,
} from "reactstrap";


let did_submit = false

const Step1 = React.forwardRef((props, ref) => {
  let prev_mac = ""
  let prev_psk = ""

  const [mac, setmac] = React.useState(""); //default is set to wpa3 (sae)
  const [psk, setpsk] = React.useState("");
  const [wpa, setwpa] = React.useState("sae");
  const [comment, setcomment] = React.useState("");

  const [macState, setmacState] = React.useState("has-success");
  const [pskState, setpskState] = React.useState("has-success");
  const [wpaState, setwpaState] = React.useState("has-success");
  const [commentState, setcommentState] = React.useState("");

  const [macFocus, setmacFocus] = React.useState("");
  const [pskFocus, setpskFocus] = React.useState("");
  const [wpaFocus, setwpaFocus] = React.useState("");
  const [commentFocus, setcommentFocus] = React.useState("");

  let submitted = () => {
    return did_submit
  }
  let setsubmitted = (v) => {
    did_submit = v
  }

  React.useImperativeHandle(ref, () => ({
    isValidated: () => {
      if(isValidated()) {
        return true
      }
      return false
    },
    state: {
      mac,
      psk,
      wpa,
      comment,
      macState,
      pskState,
      wpaState,
      setcommentState,
      submitted,
      setsubmitted,
    },
  }));

  // function that verifies if a string has a given length or not
  const verifyLength = (value, length) => {
    if (value.length >= length) {
      return true;
    }
    return false;
  };

  const filterMAC = (value) => {
    //must be of the format 00:00:00:00:00:00
    const hexChars = "0123456789abcdef"
    let digits = ""
    for (let c of value) {
        if (hexChars.indexOf(c) != -1) {
          digits += c
        }
    }
    let mac = ""
    let i = 0;
    for (i = 0; i < digits.length - 1 && i < (6*2); i+=2) {
      mac += digits[i]
      mac += digits[i+1]
      mac += ":"
    }
    if (i < digits.length && (i < (6*2))) {
      mac += digits[i]
    }
    if (mac[mac.length-1] == ":") {
      mac = mac.slice(0, mac.length - 1)
    }
    return mac;

  }
  const validateMAC = (value) => {
    //allow blank mac
    if (value == "") {
      return true;
    }
    if (value.length == 17) {
      return true;
    }
    return false;
  };

  const validatePassphrase = (value) => {
    if (value == "") {
      return true
    } else if (value.length >= 8) {
      return true
    }
    return false;
  };


  const isValidated = () => {
    if (
      macState === "has-success" &&
      pskState === "has-success" &&
      wpaState === "has-success" &&
      commentState == "has-success"
    ) {
      return true;
    } else {
      if (macState !== "has-success") {
        setmacState("has-danger");
      }
      if (pskState !== "has-success") {
        setpskState("has-danger");
      }
      if (wpaState !== "has-success") {
        setwpaState("has-danger");
      }
      if (commentState !== "has-success") {
        setcommentState("has-danger");
      }
      return false;
    }
  };

  return (
    <>
      <h5 className="info-text">
        Add a new WiFi Device. Wired devices do not need to be added.
      </h5>
      <Row className="justify-content-center">
        <Col sm="3">

            <Label> Device Name </Label>
            <InputGroup
              className={classnames(commentState, {
                "input-group-focus": commentFocus,
              })}
            >
              <InputGroupAddon addonType="prepend">
                <InputGroupText>
                </InputGroupText>
              </InputGroupAddon>
              <Input
                name="comment"
                placeholder=""
                type="text"
                onChange={(e) => {
                  setsubmitted(false)
                  if (!verifyLength(e.target.value, 1)) {
                    setcommentState("has-danger");
                  } else {
                    setcommentState("has-success");
                  }
                  setcomment(e.target.value);
                }}
                onFocus={(e) => setcommentFocus(true)}
                onBlur={(e) => setcommentFocus(false)}
              />
              {commentState === "has-danger" ? (
                <label className="error">Please set a device name</label>
              ) : null}
            </InputGroup>


            <Label>WiFi Authentication Type</Label>
            <Select
              autosize={false}
              className="react-select primary"
              classNamePrefix="react-select"
              name={wpa}
              onChange={(value) => {
                setsubmitted(false)
                setwpa(value.value)
              }}
              options={[
                {
                  value: "sae",  label: "WPA3",
                },
                { value: "wpa2", label: "WPA2" },
              ]}
              placeholder="WPA3"
            />
          <Label>MAC Address (optional, will be assigned upon first connection when not set)</Label>
          <InputGroup
            className={classnames(macState, {
              "input-group-focus": macFocus,
            })}
          >
            <InputGroupAddon addonType="prepend">
              <InputGroupText>
              </InputGroupText>
            </InputGroupAddon>
            <Input
              name="mac"
              placeholder="00:00:00:00:00:00"
              type="text"
              onChange={(e) => {
                setsubmitted(false)
                e.target.value = filterMAC(e.target.value)
                if (!validateMAC(e.target.value)) {
                  setmacState("has-danger");
                } else {
                  setmacState("has-success");
                }
                setmac(e.target.value);
              }}
              onFocus={(e) => setmacFocus(true)}
              onBlur={(e) => setmacFocus(false)}
            />
            {macState === "has-danger" ? (
              <label className="error">This field is required.</label>
            ) : null}
          </InputGroup>
          <InputGroup
            className={classnames(pskState, {
              "input-group-focus": pskFocus,
            })}
          >
            <Label> Passphrase (Leave Empty to Generate a Secure, Random PSK)</Label>
            <InputGroupAddon addonType="prepend">
              <InputGroupText>
              </InputGroupText>
            </InputGroupAddon>
            <Input
              name="psk"
              placeholder=""
              type="password"
              onChange={(e) => {
                setsubmitted(false)
                if (!validatePassphrase(e.target.value)) {
                  setpskState("has-danger");
                } else {
                  setpskState("has-success");
                }
                setpsk(e.target.value);
              }}
              onFocus={(e) => setpskFocus(true)}
              onBlur={(e) => setpskFocus(false)}
            />
            {pskState === "has-danger" ? (
              <label className="error">Passphrase must be at least 8 characters long.</label>
            ) : null}
          </InputGroup>



        </Col>
      </Row>
    </>
  );
});

export default Step1;
